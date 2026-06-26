import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projectPace } from '@/lib/risk/pace';
import { requireUser } from '@/lib/auth/session';
import type { AvailabilityRow, TaskRow, TaskStatus } from '@/lib/types';

// GET /api/projection
// Aggregated pace projection across all active goals — answers the 4th
// dashboard question: "What happens if I keep going at this pace?"
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      tasks: {
        include: { progressLogs: { orderBy: { loggedAt: 'asc' } } },
      },
      availability: true,
    },
  });

  const now = new Date();

  const perGoal = goals.map((g) => {
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
      progressLogs: t.progressLogs.map((l) => ({
        id: l.id,
        taskId: l.taskId,
        loggedAt: l.loggedAt.toISOString(),
        percentComplete: l.percentComplete,
        note: l.note,
      })),
    }));
    const availability: AvailabilityRow[] = g.availability.map((a) => ({
      id: a.id,
      goalId: a.goalId,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime ? (a.startTime instanceof Date ? a.startTime.toISOString().slice(11, 16) : String(a.startTime)) : null,
      endTime: a.endTime ? (a.endTime instanceof Date ? a.endTime.toISOString().slice(11, 16) : String(a.endTime)) : null,
      specificDate: a.specificDate ? a.specificDate.toISOString() : null,
    }));

    // Completion timestamps: the loggedAt of any progress log that hit 100%,
    // plus the createdAt of any task already done (fallback if no log).
    const completionTimestamps: string[] = [
      ...g.tasks
        .filter((t) => t.status === 'done')
        .flatMap((t) =>
          t.progressLogs
            .filter((l) => l.percentComplete >= 100)
            .map((l) => l.loggedAt.toISOString())
        ),
      ...g.tasks
        .filter((t) => t.status === 'done')
        .map((t) => t.updatedAt.toISOString()),
    ];

    const projection = projectPace({
      tasks,
      availability,
      deadline: g.deadline,
      completionTimestamps,
      now,
    });

    return {
      goalId: g.id,
      goalTitle: g.title,
      deadline: g.deadline?.toISOString() ?? null,
      projection,
    };
  });

  // Aggregate: overall remaining work vs overall remaining free time.
  const totalRemainingWork = perGoal.reduce(
    (s, g) => s + g.projection.remainingWork,
    0
  );
  const totalRemainingTime = perGoal.reduce(
    (s, g) => s + g.projection.remainingTime,
    0
  );
  const totalRemainingTasks = perGoal.reduce(
    (s, g) => s + g.projection.remainingTasks,
    0
  );
  const goalsBehind = perGoal.filter(
    (g) =>
      g.projection.verdict === 'behind' || g.projection.verdict === 'will-miss'
  ).length;

  // Overall verdict: if any goal will-miss, the portfolio is at risk.
  let overallVerdict:
    | 'on-track'
    | 'slightly-behind'
    | 'behind'
    | 'will-miss'
    | 'unknown' = 'on-track';
  if (perGoal.some((g) => g.projection.verdict === 'will-miss')) {
    overallVerdict = 'will-miss';
  } else if (perGoal.some((g) => g.projection.verdict === 'behind')) {
    overallVerdict = 'behind';
  } else if (perGoal.some((g) => g.projection.verdict === 'slightly-behind')) {
    overallVerdict = 'slightly-behind';
  } else if (perGoal.length === 0) {
    overallVerdict = 'unknown';
  }

  return NextResponse.json({
    now: now.toISOString(),
    overall: {
      verdict: overallVerdict,
      totalRemainingWork,
      totalRemainingTime,
      totalRemainingTasks,
      goalsBehind,
      ratio: totalRemainingTime > 0 ? totalRemainingWork / totalRemainingTime : Infinity,
    },
    perGoal,
  });
}
