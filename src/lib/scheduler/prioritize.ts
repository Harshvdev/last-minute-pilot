// Deterministic priority scoring.
// Spec §5: "LLM proposes, algorithm ranks". This formula is consistent run to run.
//
// score = (urgency_weight × time_to_deadline_factor)
//       + (impact_weight × dependency_count)
//       - (effort_weight × estimated_minutes)
//
// Higher score = higher priority. Used to order tasks before bin-packing.

import type { TaskRow } from '@/lib/types';

const URGENCY_WEIGHT = 100;
const IMPACT_WEIGHT = 25;
const EFFORT_WEIGHT = 0.35;

export interface ScoreInput {
  task: {
    id: string;
    estimatedMinutes: number;
    dependsOnId: string | null;
    status: string;
  };
  deadline: Date | null;
  now: Date;
  // how many OTHER tasks depend on this one (higher = more impactful)
  dependentsCount: number;
}

/**
 * Compute a priority score for a single task.
 * Returns 0 for tasks already done/skipped (they get sorted last).
 */
export function scoreTask(input: ScoreInput): number {
  const { task, deadline, now, dependentsCount } = input;

  if (task.status === 'done' || task.status === 'skipped') return -Infinity;

  // Urgency factor: 1.0 when deadline is NOW, decays toward 0 as deadline is far.
  // No deadline (habit) → small constant urgency so they don't starve.
  let urgencyFactor: number;
  if (deadline) {
    const ms = deadline.getTime() - now.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    if (days <= 0) urgencyFactor = 1.5; // overdue — top priority
    else if (days <= 1) urgencyFactor = 1.2;
    else urgencyFactor = Math.max(0.1, 1 / (1 + days * 0.15));
  } else {
    urgencyFactor = 0.25;
  }

  const urgency = URGENCY_WEIGHT * urgencyFactor;
  const impact = IMPACT_WEIGHT * dependentsCount;
  
  // Fix: Turn the effort penalty into an asset if other tasks are waiting on it
  const effortFactor = task.estimatedMinutes * EFFORT_WEIGHT;
  const effortScore = dependentsCount > 0 ? + (effortFactor * 1.5) : - effortFactor;

  // Blocked tasks (have an unmet dependency) get deprioritized slightly so the
  // scheduler tries the prerequisite first.
  const blockedPenalty = task.dependsOnId ? 5 : 0;

  return urgency + impact + effortScore - blockedPenalty;
}

/**
 * Rank tasks by computed priority. Mutates nothing; returns sorted copy.
 */
export function prioritize(
  tasks: TaskRow[],
  deadline: Date | null,
  now: Date = new Date()
): TaskRow[] {
  // Count dependents for each task.
  const dependentsCount = new Map<string, number>();
  for (const t of tasks) {
    if (t.dependsOnId) {
      dependentsCount.set(
        t.dependsOnId,
        (dependentsCount.get(t.dependsOnId) ?? 0) + 1
      );
    }
  }

  const scored = tasks.map((t) => ({
    task: t,
    score: scoreTask({
      task: {
        id: t.id,
        estimatedMinutes: t.estimatedMinutes,
        dependsOnId: t.dependsOnId,
        status: t.status,
      },
      deadline,
      now,
      dependentsCount: dependentsCount.get(t.id) ?? 0,
    }),
  }));

  scored.sort((a, b) => {
    // Done/skipped always sink to the bottom, preserving their order_index.
    if (a.score === -Infinity && b.score === -Infinity) {
      return a.task.orderIndex - b.task.orderIndex;
    }
    if (a.score === -Infinity) return 1;
    if (b.score === -Infinity) return -1;
    if (b.score !== a.score) return b.score - a.score;
    return a.task.orderIndex - b.task.orderIndex;
  });

  return scored.map((s) => s.task);
}
