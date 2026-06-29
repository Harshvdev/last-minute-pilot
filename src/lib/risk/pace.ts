// Pace projection — answers "what happens if I keep going at this pace?"
//
// Uses the user's actual completion velocity (tasks done per day, derived
// from progress logs) to forecast whether they will hit the deadline. This is
// deterministic, like the rest of the engine.
//
// If the user has no history yet, we fall back to a neutral assumption:
// "you'll finish the remaining work at a steady pace across your available
// windows".

import type { TaskRow, AvailabilityRow } from '@/lib/types';
import { expandAvailability } from '@/lib/scheduler/fit-blocks';

export interface PaceInput {
  tasks: TaskRow[];
  availability: AvailabilityRow[];
  deadline: Date | null;
  // ISO timestamps of when each task was completed (from progress logs)
  completionTimestamps: string[];
  now?: Date;
  timezone?: string;
}

export interface PaceProjection {
  // tasks per day the user has actually been completing
  velocity: number; // tasks/day
  // remaining tasks to complete
  remainingTasks: number;
  // remaining work minutes
  remainingWork: number;
  // remaining free time minutes until deadline
  remainingTime: number;
  // forecasted completion date at current velocity
  forecastedFinish: Date | null;
  // days late/early vs deadline (negative = early, positive = late)
  daysDelta: number | null;
  // simple verdict string
  verdict: 'on-track' | 'slightly-behind' | 'behind' | 'will-miss' | 'unknown';
  // human-readable summary
  summary: string;
  // confidence: low when little history, high when >= 3 completions
  confidence: 'low' | 'medium' | 'high';
}

const HORIZON_DAYS_NO_DEADLINE = 14;

export function projectPace(input: PaceInput): PaceProjection {
  const now = input.now ?? new Date();
  const activeTasks = input.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'skipped'
  );
  const remainingTasks = activeTasks.length;
  const remainingWork = activeTasks.reduce(
    (s, t) => s + (t.estimatedMinutes || 0),
    0
  );

  // Determine remaining free time.
  let remainingTime: number;
  let horizon: Date;
  if (input.deadline && input.deadline > now) {
    horizon = input.deadline;
  } else if (input.deadline && input.deadline <= now) {
    remainingTime = 0;
    horizon = now;
    return finishProjection(
      remainingTasks,
      remainingWork,
      0,
      null,
      input.deadline,
      now,
      'unknown',
      0
    );
  } else {
    horizon = new Date(now.getTime() + HORIZON_DAYS_NO_DEADLINE * 86400000);
  }
  const windows = expandAvailability(input.availability, now, horizon, input.timezone);
  remainingTime = windows.reduce(
    (s, w) => s + (w.end.getTime() - w.start.getTime()) / 60000,
    0
  );

  // Derive velocity from completion history.
  // We look at the oldest completion timestamp and compute tasks/day since.
  let velocity = 0;
  let confidence: PaceProjection['confidence'] = 'low';
  const completions = input.completionTimestamps
    .map((t) => new Date(t))
    .filter((d) => !isNaN(d.getTime()) && d <= now)
    .sort((a, b) => a.getTime() - b.getTime());

  if (completions.length === 0) {
    // No history — neutral assumption: distribute remaining work evenly.
    velocity = 0;
    confidence = 'low';
  } else if (completions.length < 3) {
    // Very little history — low confidence.
    const span = Math.max(
      1,
      (now.getTime() - completions[0].getTime()) / 86400000
    );
    velocity = completions.length / span;
    confidence = 'low';
  } else {
    const span = Math.max(
      1,
      (now.getTime() - completions[0].getTime()) / 86400000
    );
    velocity = completions.length / span;
    confidence = completions.length >= 6 ? 'high' : 'medium';
  }

  return finishProjection(
    remainingTasks,
    remainingWork,
    remainingTime,
    velocity > 0 ? velocity : null,
    input.deadline,
    now,
    'unknown',
    velocity
  );
}

function finishProjection(
  remainingTasks: number,
  remainingWork: number,
  remainingTime: number,
  velocity: number | null,
  deadline: Date | null,
  now: Date,
  _initialVerdict: PaceProjection['verdict'],
  computedVelocity: number
): PaceProjection {
  // If no remaining work, we're done.
  if (remainingWork <= 0) {
    return {
      velocity: computedVelocity,
      remainingTasks,
      remainingWork: 0,
      remainingTime,
      forecastedFinish: now,
      daysDelta: deadline
        ? Math.round((now.getTime() - deadline.getTime()) / 86400000)
        : null,
      verdict: 'on-track',
      summary: 'All work complete.',
      confidence: 'high',
    };
  }

  // If no free time at all → will miss.
  if (remainingTime <= 0) {
    return {
      velocity: computedVelocity,
      remainingTasks,
      remainingWork,
      remainingTime: 0,
      forecastedFinish: null,
      daysDelta: deadline
        ? Math.round((now.getTime() - deadline.getTime()) / 86400000)
        : null,
      verdict: 'will-miss',
      summary: `No free time available before ${
        deadline ? 'the deadline' : 'horizon'
      }.`,
      confidence: 'medium',
    };
  }

  // Forecast: assume the user spends remaining free time on remaining work.
  // Effective pace (minutes of work per day) derived from velocity × avg task
  // length, OR if no velocity, assume all available time is used productively.
  const avgTaskMinutes =
    remainingTasks > 0 ? remainingWork / remainingTasks : 30;
  const dailyWorkMinutes =
    velocity !== null && velocity > 0
      ? velocity * avgTaskMinutes
      : // Fallback: spread remaining work across the time-to-decline in days.
        remainingWork /
        Math.max(1, remainingTime / 60 / Math.max(1, now.getHours() > 0 ? 1 : 1));

  // Forecasted finish date: today + (remainingWork / dailyWorkMinutes) days.
  const daysToFinish =
    dailyWorkMinutes > 0 ? remainingWork / dailyWorkMinutes : Infinity;
  const forecastedFinish = isFinite(daysToFinish)
    ? new Date(now.getTime() + daysToFinish * 86400000)
    : null;

  let daysDelta: number | null = null;
  let verdict: PaceProjection['verdict'] = 'unknown';
  let summary = '';

  if (deadline) {
    daysDelta = forecastedFinish
      ? Math.round((forecastedFinish.getTime() - deadline.getTime()) / 86400000)
      : null;

    if (daysDelta === null) {
      verdict = 'unknown';
      summary = 'Not enough data to project a finish date.';
    } else if (daysDelta <= -1) {
      verdict = 'on-track';
      summary = `At your current pace, you'll finish ~${Math.abs(
        daysDelta
      )} day${Math.abs(daysDelta) === 1 ? '' : 's'} early.`;
    } else if (daysDelta === 0) {
      verdict = 'on-track';
      summary = `At your current pace, you'll finish right on the deadline.`;
    } else if (daysDelta <= 1) {
      verdict = 'slightly-behind';
      summary = `At your current pace, you'll finish about a day late.`;
    } else if (daysDelta <= 3) {
      verdict = 'behind';
      summary = `At your current pace, you'll finish ~${daysDelta} days late.`;
    } else {
      verdict = 'will-miss';
      summary = `At your current pace, you'll miss the deadline by ~${daysDelta} days.`;
    }
  } else {
    // No deadline — judge against whether work fits in available time.
    if (remainingWork > remainingTime) {
      verdict = 'will-miss';
      summary = `You have ${Math.round(remainingWork)}m of work but only ${Math.round(
        remainingTime
      )}m of free time — not everything will fit.`;
    } else if (remainingWork > remainingTime * 0.8) {
      verdict = 'behind';
      summary = `Work is tight against your free time.`;
    } else {
      verdict = 'on-track';
      summary = `Comfortable headroom against your free time.`;
    }
  }

  return {
    velocity: computedVelocity,
    remainingTasks,
    remainingWork,
    remainingTime,
    forecastedFinish,
    daysDelta,
    verdict,
    summary,
    confidence:
      computedVelocity > 0 && computedVelocity !== null
        ? 'medium'
        : 'low',
  };
}

export const PACE_VERDICT_STYLES: Record<
  PaceProjection['verdict'],
  { label: string; tone: 'success' | 'warning' | 'destructive' | 'muted' }
> = {
  'on-track': { label: 'On pace', tone: 'success' },
  'slightly-behind': { label: 'Slightly behind', tone: 'warning' },
  behind: { label: 'Behind', tone: 'warning' },
  'will-miss': { label: 'Will miss', tone: 'destructive' },
  unknown: { label: 'Unknown pace', tone: 'muted' },
};
