import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { assessRisk } from '@/lib/risk/assess';
import { requireUser, getUserTimezone } from '@/lib/auth/session';
import type { AvailabilityRow, TaskRow, TaskStatus } from '@/lib/types';

// GET /api/notifications
// Generates a feed of actionable alerts derived from current state:
//   - goals at high/critical risk
//   - goals with upcoming deadlines (<= 2 days)
//   - schedule blocks happening soon (<= 2 hours)
//   - goals with no availability set (can't be scheduled)
//   - end-of-day summary when behind
//
// All derived — no persistence needed for the sandbox. In production this
// would be backed by a notifications table with read/unread state.
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const timezone = await getUserTimezone(userId);

  const now = new Date();
  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      tasks: true,
      availability: true,
      riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 1 },
    },
  });

  const alerts: Alert[] = [];

  for (const goal of goals) {
    const tasks: TaskRow[] = goal.tasks.map((t) => ({
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
    const availability: AvailabilityRow[] = goal.availability.map((a) => ({
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
      deadline: goal.deadline,
      now,
      timezone,
    });

    // High/critical risk alert
    if (assessment.riskLevel === 'critical' || assessment.riskLevel === 'high') {
      alerts.push({
        id: `risk-${goal.id}`,
        type: 'risk',
        severity: assessment.riskLevel === 'critical' ? 'critical' : 'warning',
        goalId: goal.id,
        goalTitle: goal.title,
        title:
          assessment.riskLevel === 'critical'
            ? `${goal.title} is at critical risk`
            : `${goal.title} is behind schedule`,
        body: assessment.reason,
        actionLabel: 'Reassess risk',
        actionHref: `/goals/${goal.id}`,
        createdAt: goal.riskAssessments[0]?.assessedAt?.toISOString() ?? now.toISOString(),
      });
    }

    // Upcoming deadline alert (<= 2 days)
    if (goal.deadline) {
      const hoursToDeadline =
        (new Date(goal.deadline).getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursToDeadline > 0 && hoursToDeadline <= 48) {
        alerts.push({
          id: `deadline-${goal.id}`,
          type: 'deadline',
          severity: hoursToDeadline <= 12 ? 'critical' : 'warning',
          goalId: goal.id,
          goalTitle: goal.title,
          title: `${goal.title} is due in ${Math.round(hoursToDeadline)} hour${
            Math.round(hoursToDeadline) === 1 ? '' : 's'
          }`,
          body: `${assessment.remainingWork}m of work remaining.`,
          actionLabel: 'Open goal',
          actionHref: `/goals/${goal.id}`,
          createdAt: now.toISOString(),
        });
      }
    }

    // No availability set
    if (goal.availability.length === 0 && assessment.remainingWork > 0) {
      alerts.push({
        id: `no-availability-${goal.id}`,
        type: 'config',
        severity: 'info',
        goalId: goal.id,
        goalTitle: goal.title,
        title: `${goal.title} has no availability`,
        body: 'Add work windows so the scheduler can fit tasks into your free time.',
        actionLabel: 'Set availability',
        actionHref: `/goals/${goal.id}`,
        createdAt: now.toISOString(),
      });
    }
  }

  // Soon-starting schedule blocks (<= 2 hours) for this user only.
  const soonBlocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: now, lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
      status: 'planned',
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
    take: 3,
  });
  for (const b of soonBlocks) {
    const minsToStart = Math.round(
      (b.startAt.getTime() - now.getTime()) / 60000
    );
    alerts.push({
      id: `block-${b.id}`,
      type: 'upcoming',
      severity: 'info',
      goalId: b.task.goalId,
      goalTitle: b.task.goal.title,
      title: minsToStart <= 0 ? 'Starting now' : `Starting in ${minsToStart}m`,
      body: b.task.title,
      actionLabel: 'Open schedule',
      actionHref: `/goals/${b.task.goalId}`,
      createdAt: now.toISOString(),
    });
  }

  // Sort by severity then recency
  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json({
    now: now.toISOString(),
    count: alerts.length,
    alerts,
  });
}

interface Alert {
  id: string;
  type: 'risk' | 'deadline' | 'upcoming' | 'config';
  severity: 'critical' | 'warning' | 'info';
  goalId: string;
  goalTitle: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  createdAt: string;
}
