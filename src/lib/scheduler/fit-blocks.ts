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
  timezone?: string;
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
 * Safe helper to get the timezone offset in milliseconds for a given date.
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  
  const y = Number(partMap.year);
  const m = Number(partMap.month);
  const d = Number(partMap.day);
  const h = Number(partMap.hour === '24' ? '0' : partMap.hour);
  const min = Number(partMap.minute);
  const s = Number(partMap.second);
  
  const localUtc = Date.UTC(y, m - 1, d, h, min, s);
  return localUtc - date.getTime();
}

/**
 * Safely converts a local date-time to a UTC Date in a specific timezone,
 * accounting for DST transitions and non-existent/ambiguous local times.
 */
function localTimeToUTC(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getTimezoneOffset(timezone, utcDate);
  const candidate = new Date(utcDate.getTime() - offset);
  const candidateOffset = getTimezoneOffset(timezone, candidate);
  
  if (offset !== candidateOffset) {
    return new Date(utcDate.getTime() - candidateOffset);
  }
  return candidate;
}

/**
 * Helper to get date parts of a UTC Date in a specific timezone.
 */
function getPartsInTimeZone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(partMap.year),
    month: Number(partMap.month),
    day: Number(partMap.day),
    hour: Number(partMap.hour === '24' ? '0' : partMap.hour),
    minute: Number(partMap.minute),
    second: Number(partMap.second),
  };
}

/**
 * Expand the user's recurring + one-off availability rules into a list of
 * concrete [start, end) windows between `start` and `end`.
 */
export function expandAvailability(
  availability: AvailabilityRow[],
  start: Date,
  end: Date,
  timezone: string = 'UTC'
): { start: Date; end: Date }[] {
  if (start >= end) return [];
  const windows: { start: Date; end: Date }[] = [];

  // Cap iteration at the horizon to avoid runaway loops on weird input.
  const maxIterations = 365;
  let it = 0;

  const startParts = getPartsInTimeZone(start, timezone);
  const localCursor = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  
  const endParts = getPartsInTimeZone(end, timezone);
  const localEnd = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day + 1));

  for (const rule of availability) {
    if (rule.specificDate) {
      const date = new Date(rule.specificDate);
      if (isNaN(date.getTime())) continue;
      if (rule.startTime && rule.endTime) {
        const y = date.getUTCFullYear();
        const m = date.getUTCMonth() + 1;
        const d = date.getUTCDate();
        
        const [sh, sm] = rule.startTime.split(':').map(Number);
        const [eh, em] = rule.endTime.split(':').map(Number);
        
        const s = localTimeToUTC(y, m, d, sh ?? 0, sm ?? 0, timezone);
        const e = localTimeToUTC(y, m, d, eh ?? 0, em ?? 0, timezone);
        
        if (s < e && e > start && s < end) {
          windows.push({
            start: s < start ? start : s,
            end: e > end ? end : e,
          });
        }
      }
    } else if (rule.dayOfWeek != null && rule.startTime && rule.endTime) {
      let cursor = new Date(localCursor);
      it = 0;
      while (cursor <= localEnd && it++ < maxIterations) {
        const dayOfWeek = cursor.getUTCDay();
        if (dayOfWeek === rule.dayOfWeek) {
          const y = cursor.getUTCFullYear();
          const m = cursor.getUTCMonth() + 1;
          const d = cursor.getUTCDate();
          
          const [sh, sm] = rule.startTime.split(':').map(Number);
          const [eh, em] = rule.endTime.split(':').map(Number);
          
          const s = localTimeToUTC(y, m, d, sh ?? 0, sm ?? 0, timezone);
          const e = localTimeToUTC(y, m, d, eh ?? 0, em ?? 0, timezone);
          
          if (s < e && e > start && s < end) {
            windows.push({
              start: s < start ? start : s,
              end: e > end ? end : e,
            });
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
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

/**
 * Fit prioritized tasks into the availability windows.
 * A task may be split across multiple windows if a single window is shorter
 * than the task's estimated minutes (granularity: SLOT_MINUTES).
 */
export function fitBlocks(input: FitInput): FitResult {
  const horizon = input.deadline
    ? input.deadline
    : new Date(input.start.getTime() + HORIZON_DAYS_NO_DEADLINE * 24 * 60 * 60 * 1000);

  let windows = expandAvailability(input.availability, input.start, horizon, input.timezone);

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
