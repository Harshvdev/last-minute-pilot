// Deterministic bin-packing scheduler.
// Spec §5: "Constraint-based scheduler (simple greedy bin-packing across
// availability windows) — not the LLM. LLMs are unreliable at exact time
// arithmetic."
//
// Given a prioritized task list and the user's availability windows between
// now and the deadline, produce a list of schedule blocks that fit each task
// into a real time slot. Tasks are placed greedily in priority order, each
// one consuming the next available window(s) until its estimated minutes are
// covered. Tasks that don't fit are returned as `unscheduled`.

import type { AvailabilityRow, TaskRow } from '@/lib/types';

export interface FitInput {
  tasks: TaskRow[]; // already prioritized (highest first)
  availability: AvailabilityRow[];
  start: Date; // now
  deadline: Date | null; // null = no deadline; use 14-day horizon
  // Busy slots from Google Calendar (or other external calendars).
  // The scheduler will not place blocks during these times.
  busySlots?: { start: Date; end: Date }[];
}

export interface ScheduledBlock {
  taskId: string;
  startAt: Date;
  endAt: Date;
}

export interface FitResult {
  scheduled: ScheduledBlock[];
  unscheduled: string[]; // task ids
  totalMinutesPlanned: number;
  totalMinutesAvailable: number;
}

const HORIZON_DAYS_NO_DEADLINE = 14;
const SLOT_MINUTES = 15; // granularity

/**
 * Expand the user's recurring + one-off availability rules into a list of
 * concrete [start, end) windows between `start` and `end`.
 */
export function expandAvailability(
  availability: AvailabilityRow[],
  start: Date,
  end: Date
): { start: Date; end: Date }[] {
  if (start >= end) return [];
  const windows: { start: Date; end: Date }[] = [];

  // Cap iteration at the horizon to avoid runaway loops on weird input.
  const maxIterations = 365;
  let it = 0;

  for (const rule of availability) {
    if (rule.specificDate) {
      const date = new Date(rule.specificDate);
      if (isNaN(date.getTime())) continue;
      if (rule.startTime && rule.endTime) {
        const s = combineDateTime(date, rule.startTime);
        const e = combineDateTime(date, rule.endTime);
        if (s < e && e > start && s < end) {
          windows.push({
            start: s < start ? start : s,
            end: e > end ? end : e,
          });
        }
      }
    } else if (rule.dayOfWeek != null && rule.startTime && rule.endTime) {
      // Walk day by day from start (truncated to midnight) to end.
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      while (cursor < end && it++ < maxIterations) {
        if (cursor.getDay() === rule.dayOfWeek) {
          const s = combineDateTime(cursor, rule.startTime);
          const e = combineDateTime(cursor, rule.endTime);
          if (s < e && e > start && s < end) {
            windows.push({
              start: s < start ? start : s,
              end: e > end ? end : e,
            });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  // Sort and merge overlapping windows.
  windows.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: { start: Date; end: Date }[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = w.end > last.end ? w.end : last.end;
    } else {
      merged.push({ start: new Date(w.start), end: new Date(w.end) });
    }
  }
  return merged;
}

function combineDateTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/**
 * Fit prioritized tasks into the availability windows.
 * A task may be split across multiple windows if a single window is shorter
 * than the task's estimated minutes (granularity: SLOT_MINUTES).
 */
export function fitBlocks(input: FitInput): FitResult {
  const horizon = input.deadline
    ? input.deadline
    : new Date(input.start.getTime() + HORIZON_DAYS_NO_DEADLINE * 24 * 60 * 60 * 1000);

  let windows = expandAvailability(input.availability, input.start, horizon);

  // Subtract busy slots (from Google Calendar) from the availability windows.
  // This ensures we don't double-book the user's existing events.
  if (input.busySlots && input.busySlots.length > 0) {
    windows = subtractBusySlots(windows, input.busySlots);
  }

  const totalMinutesAvailable = windows.reduce(
    (sum, w) => sum + (w.end.getTime() - w.start.getTime()) / 60000,
    0
  );

  // Convert windows into a list of free-slot cursors we can consume.
  // Each window is broken into SLOT_MINUTES chunks for cleaner splitting.
  const slots: { start: Date; end: Date; used: boolean }[] = [];
  for (const w of windows) {
    let cursor = new Date(w.start);
    while (cursor < w.end) {
      const slotEnd = new Date(
        Math.min(cursor.getTime() + SLOT_MINUTES * 60000, w.end.getTime())
      );
      slots.push({ start: new Date(cursor), end: slotEnd, used: false });
      cursor = slotEnd;
    }
  }

  const scheduled: ScheduledBlock[] = [];
  const unscheduled: string[] = [];
  let totalMinutesPlanned = 0;

  for (const task of input.tasks) {
    if (task.status === 'done' || task.status === 'skipped') continue;

    let remainingMs = task.estimatedMinutes * 60000;
    let currentBlockStart: Date | null = null;
    let currentBlockEnd: Date | null = null;

    for (const slot of slots) {
      if (slot.used) continue;
      if (remainingMs <= 0) break;

      // Start or extend the current block if this slot is contiguous.
      if (
        currentBlockEnd &&
        slot.start.getTime() === currentBlockEnd.getTime()
      ) {
        currentBlockEnd = slot.end;
      } else {
        // Flush previous block if any
        if (currentBlockStart && currentBlockEnd) {
          scheduled.push({
            taskId: task.id,
            startAt: currentBlockStart,
            endAt: currentBlockEnd,
          });
        }
        currentBlockStart = slot.start;
        currentBlockEnd = slot.end;
      }
      slot.used = true;
      remainingMs -= slot.end.getTime() - slot.start.getTime();
    }

    // Flush trailing block
    if (currentBlockStart && currentBlockEnd && remainingMs <= 0) {
      scheduled.push({
        taskId: task.id,
        startAt: currentBlockStart,
        endAt: currentBlockEnd,
      });
      totalMinutesPlanned += task.estimatedMinutes;
    } else if (currentBlockStart && currentBlockEnd) {
      // Partial fit — keep what we got, but mark task as unscheduled remainder.
      scheduled.push({
        taskId: task.id,
        startAt: currentBlockStart,
        endAt: currentBlockEnd,
      });
      totalMinutesPlanned +=
        (currentBlockEnd.getTime() - currentBlockStart.getTime()) / 60000;
      unscheduled.push(task.id);
    } else {
      unscheduled.push(task.id);
    }
  }

  return {
    scheduled,
    unscheduled,
    totalMinutesPlanned: Math.round(totalMinutesPlanned),
    totalMinutesAvailable: Math.round(totalMinutesAvailable),
  };
}

/**
 * Subtract busy slots from availability windows.
 * For each window, split it around any overlapping busy slot.
 * Returns a new list of non-overlapping free windows.
 */
function subtractBusySlots(
  windows: { start: Date; end: Date }[],
  busySlots: { start: Date; end: Date }[]
): { start: Date; end: Date }[] {
  const result: { start: Date; end: Date }[] = [];

  for (const window of windows) {
    // Find all busy slots that overlap this window.
    const overlapping = busySlots
      .filter(
        (b) => b.start < window.end && b.end > window.start
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (overlapping.length === 0) {
      result.push(window);
      continue;
    }

    // Walk through the window, carving out busy sections.
    let cursor = new Date(window.start);
    for (const busy of overlapping) {
      if (busy.start > cursor) {
        // Free segment before this busy slot.
        result.push({
          start: new Date(cursor),
          end: new Date(Math.min(busy.start.getTime(), window.end.getTime())),
        });
      }
      cursor = new Date(Math.max(cursor.getTime(), busy.end.getTime()));
      if (cursor >= window.end) break;
    }
    // Trailing free segment after the last busy slot.
    if (cursor < window.end) {
      result.push({ start: new Date(cursor), end: new Date(window.end) });
    }
  }

  return result;
}
