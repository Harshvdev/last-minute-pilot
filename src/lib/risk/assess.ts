// Deterministic risk assessment.
// Spec §6: deterministic comparison of planned vs. actual progress vs.
// remaining time. The LLM only writes the human-readable explanation afterward.
//
//   remaining_work = sum(estimated_minutes for tasks where status != 'done')
//   remaining_time = sum(available minutes between now and deadline)
//
//   if remaining_work > remaining_time * 1.0  → critical
//   if remaining_work > remaining_time * 0.8  → high
//   if remaining_work > remaining_time * 0.5  → medium
//   else                                       → low

import type {
  AvailabilityRow,
  RiskLevel,
  TaskRow,
} from '@/lib/types';
import { expandAvailability } from '@/lib/scheduler/fit-blocks';

export interface AssessInput {
  tasks: TaskRow[];
  availability: AvailabilityRow[];
  deadline: Date | null;
  now?: Date;
  timezone?: string;
}

export interface Assessment {
  riskLevel: RiskLevel;
  remainingWork: number; // minutes
  remainingTime: number; // minutes
  ratio: number; // remaining_work / remaining_time (Infinity if no time)
  completedTasks: number;
  totalTasks: number;
  reason: string;
}

const HORIZON_DAYS_NO_DEADLINE = 14;

export function assessRisk(input: AssessInput): Assessment {
  const now = input.now ?? new Date();
  const activeTasks = input.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'skipped'
  );
  const remainingWork = activeTasks.reduce(
    (sum, t) => sum + (t.estimatedMinutes || 0),
    0
  );

  let remainingTime: number;
  if (input.deadline) {
    const end = input.deadline > now ? input.deadline : now;
    const windows = expandAvailability(input.availability, now, end, input.timezone);
    remainingTime = windows.reduce(
      (sum, w) => sum + (w.end.getTime() - w.start.getTime()) / 60000,
      0
    );
  } else {
    const horizon = new Date(
      now.getTime() + HORIZON_DAYS_NO_DEADLINE * 24 * 60 * 60 * 1000
    );
    const windows = expandAvailability(input.availability, now, horizon, input.timezone);
    remainingTime = windows.reduce(
      (sum, w) => sum + (w.end.getTime() - w.start.getTime()) / 60000,
      0
    );
  }

  remainingTime = Math.round(remainingTime);

  let riskLevel: RiskLevel;
  let reason: string;

  if (remainingTime <= 0) {
    if (remainingWork > 0) {
      riskLevel = 'critical';
      reason = 'No free time available before the deadline.';
    } else {
      riskLevel = 'low';
      reason = 'All work complete.';
    }
  } else {
    const ratio = remainingWork / remainingTime;
    if (ratio > 1.0) {
      riskLevel = 'critical';
      reason = `Work remaining (${remainingWork}m) exceeds available time (${remainingTime}m).`;
    } else if (ratio > 0.8) {
      riskLevel = 'high';
      reason = `Work remaining (${remainingWork}m) is close to available time (${remainingTime}m).`;
    } else if (ratio > 0.5) {
      riskLevel = 'medium';
      reason = `Work remaining (${remainingWork}m) is more than half of available time (${remainingTime}m).`;
    } else {
      riskLevel = 'low';
      reason = `Comfortably within available time (${remainingWork}m of ${remainingTime}m).`;
    }
  }

  const completedTasks = input.tasks.filter((t) => t.status === 'done').length;

  return {
    riskLevel,
    remainingWork,
    remainingTime,
    ratio: remainingTime > 0 ? remainingWork / remainingTime : Infinity,
    completedTasks,
    totalTasks: input.tasks.length,
    reason,
  };
}

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'On track',
  medium: 'Watch',
  high: 'Behind',
  critical: 'Critical',
};

export const RISK_DESCRIPTION: Record<RiskLevel, string> = {
  low: 'Plenty of slack. Keep your pace.',
  medium: 'Tightening up. Stay focused.',
  high: 'You are behind. Replan soon.',
  critical: 'Will not finish at current pace.',
};
