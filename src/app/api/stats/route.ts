import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessRisk } from '@/lib/risk/assess';
import { requireUser } from '@/lib/auth/session';
import type { AvailabilityRow, TaskRow, TaskStatus } from '@/lib/types';

// GET /api/stats
// Dashboard summary: counts, today's blocks, active goals with latest risk.
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
      riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 8 },
    },
  });

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const todayBlocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: dayStart, lte: dayEnd },
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
  });

  const upcomingBlocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: now },
      status: 'planned',
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
    take: 20,
  });

  // Compute live risk for each goal (don't rely only on persisted assessments).
  const goalsWithRisk = goals.map((g) => {
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
    const total = g.tasks.length;
    const done = g.tasks.filter((t) => t.status === 'done').length;
    const remainingMinutes = g.tasks
      .filter((t) => t.status !== 'done' && t.status !== 'skipped')
      .reduce((s, t) => s + t.estimatedMinutes, 0);
    return {
      id: g.id,
      title: g.title,
      category: g.category,
      goalType: g.goalType,
      deadline: g.deadline?.toISOString() ?? null,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      doneTasks: done,
      totalTasks: total,
      remainingMinutes,
      riskLevel: assessment.riskLevel,
      remainingWork: assessment.remainingWork,
      remainingTime: assessment.remainingTime,
      latestRisk: g.riskAssessments[0] ?? null,
      // Risk history (oldest first for sparkline rendering).
      riskHistory: g.riskAssessments
        .slice()
        .reverse()
        .map((r) => ({
          id: r.id,
          riskLevel: r.riskLevel,
          assessedAt: r.assessedAt.toISOString(),
        })),
    };
  });

  const totalActiveGoals = goals.length;
  const totalTasks = goals.reduce((s, g) => s + g.tasks.length, 0);
  const doneTasks = goals.reduce(
    (s, g) => s + g.tasks.filter((t) => t.status === 'done').length,
    0
  );
  const criticalGoals = goalsWithRisk.filter(
    (g) => g.riskLevel === 'critical' || g.riskLevel === 'high'
  ).length;

  return NextResponse.json({
    now: now.toISOString(),
    summary: {
      totalActiveGoals,
      totalTasks,
      doneTasks,
      criticalGoals,
      todayBlocksCount: todayBlocks.length,
    },
    goals: goalsWithRisk,
    todayBlocks: todayBlocks.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: b.status,
      task: {
        id: b.task.id,
        title: b.task.title,
        estimatedMinutes: b.task.estimatedMinutes,
        goalId: b.task.goalId,
        goalTitle: b.task.goal.title,
        goalCategory: b.task.goal.category,
      },
    })),
    upcomingBlocks: upcomingBlocks.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      status: b.status,
      task: {
        id: b.task.id,
        title: b.task.title,
        estimatedMinutes: b.task.estimatedMinutes,
        goalId: b.task.goalId,
        goalTitle: b.task.goal.title,
        goalCategory: b.task.goal.category,
      },
    })),
  });
}
