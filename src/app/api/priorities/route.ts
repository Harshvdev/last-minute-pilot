import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scoreTask } from '@/lib/scheduler/prioritize';
import { assessRisk } from '@/lib/risk/assess';
import { requireUser } from '@/lib/auth/session';
import type { TaskRow, TaskStatus, AvailabilityRow } from '@/lib/types';

// GET /api/priorities
// Returns the top 3 undone tasks across all active goals, ranked by
// urgency × impact × goal priority. Used by the dashboard "Top 3 priorities" card.
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      tasks: true,
      availability: true,
    },
  });

  const now = new Date();

  interface Candidate {
    taskId: string;
    title: string;
    estimatedMinutes: number;
    dependsOnId: string | null;
    isBlocked: boolean;
    goalId: string;
    goalTitle: string;
    goalCategory: string | null;
    goalPriority: number;
    goalDeadline: string | null;
    goalRiskLevel: string;
    goalProgress: number;
    goalDoneTasks: number;
    goalTotalTasks: number;
    score: number;
  }

  const candidates: Candidate[] = [];

  for (const g of goals) {
    const tasks: TaskRow[] = g.tasks.map((t) => ({
      id: t.id,
      goalId: t.goalId,
      title: t.title,
      description: t.description,
      estimatedMinutes: t.estimatedMinutes,
      priorityScore: t.priorityScore,
      dependsOnId: t.dependsOnId,
      status: t.status as TaskStatus,
      orderIndex: t.orderIndex,
      scheduleBlocks: [],
      progressLogs: [],
    }));
    const availability: AvailabilityRow[] = g.availability.map((a) => ({
      id: a.id,
      goalId: a.goalId,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime ? (a.startTime instanceof Date ? a.startTime.toISOString().slice(11, 16) : String(a.startTime)) : null,
      endTime: a.endTime ? (a.endTime instanceof Date ? a.endTime.toISOString().slice(11, 16) : String(a.endTime)) : null,
      specificDate: a.specificDate ? a.specificDate.toISOString() : null,
    }));
    const assessment = assessRisk({
      tasks,
      availability,
      deadline: g.deadline,
      now,
    });

    const doneTasks = g.tasks.filter((t) => t.status === 'done').length;
    const totalTasks = g.tasks.length;
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const doneIds = new Set(
      g.tasks.filter((t) => t.status === 'done').map((t) => t.id)
    );

    const dependentsCount = new Map<string, number>();
    for (const t of g.tasks) {
      if (t.dependsOnId) {
        dependentsCount.set(
          t.dependsOnId,
          (dependentsCount.get(t.dependsOnId) ?? 0) + 1
        );
      }
    }

    for (const t of g.tasks) {
      if (t.status === 'done' || t.status === 'skipped') continue;
      const isBlocked = !!t.dependsOnId && !doneIds.has(t.dependsOnId);
      const baseScore = scoreTask({
        task: {
          id: t.id,
          estimatedMinutes: t.estimatedMinutes,
          dependsOnId: t.dependsOnId,
          status: t.status,
        },
        deadline: g.deadline,
        now,
        dependentsCount: dependentsCount.get(t.id) ?? 0,
      });
      const goalPriorityBoost = (g.priority ?? 0) * 15;
      const blockedPenalty = isBlocked ? 20 : 0;
      const riskBoost =
        assessment.riskLevel === 'critical'
          ? 25
          : assessment.riskLevel === 'high'
            ? 15
            : assessment.riskLevel === 'medium'
              ? 5
              : 0;

      candidates.push({
        taskId: t.id,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes,
        dependsOnId: t.dependsOnId,
        isBlocked,
        goalId: g.id,
        goalTitle: g.title,
        goalCategory: g.category,
        goalPriority: g.priority ?? 0,
        goalDeadline: g.deadline?.toISOString() ?? null,
        goalRiskLevel: assessment.riskLevel,
        goalProgress: progress,
        goalDoneTasks: doneTasks,
        goalTotalTasks: totalTasks,
        score: baseScore + goalPriorityBoost + riskBoost - blockedPenalty,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    now: now.toISOString(),
    priorities: candidates.slice(0, 3),
    totalCandidates: candidates.length,
  });
}
