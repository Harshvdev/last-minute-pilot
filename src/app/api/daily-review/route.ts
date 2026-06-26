import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { startOfDay, endOfDay, startOfTomorrow, endOfTomorrow } from 'date-fns';
import { requireUser } from '@/lib/auth/session';

// GET /api/daily-review
// End-of-day summary: what you accomplished today, what's at risk, and what's
// scheduled for tomorrow. Designed for a 5-minute daily review ritual.
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfTomorrow();
  const tomorrowEnd = endOfTomorrow();

  // Today's completions — this user's goals only.
  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    include: {
      tasks: {
        include: {
          progressLogs: true,
          scheduleBlocks: { orderBy: { startAt: 'asc' } },
        },
      },
      availability: true,
      riskAssessments: { orderBy: { assessedAt: 'desc' }, take: 1 },
    },
  });

  let tasksCompletedToday = 0;
  let minutesInvestedToday = 0;
  const completedTaskTitles: string[] = [];

  for (const goal of goals) {
    for (const task of goal.tasks) {
      for (const log of task.progressLogs) {
        if (
          log.percentComplete >= 100 &&
          log.loggedAt >= todayStart &&
          log.loggedAt <= todayEnd
        ) {
          tasksCompletedToday++;
          minutesInvestedToday += task.estimatedMinutes;
          completedTaskTitles.push(task.title);
        }
      }
    }
  }

  // Tomorrow's scheduled blocks (this user only).
  const tomorrowBlocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: tomorrowStart, lte: tomorrowEnd },
      status: 'planned',
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
  });

  const tomorrowMinutes = tomorrowBlocks.reduce((s, b) => {
    return s + (b.endAt.getTime() - b.startAt.getTime()) / 60000;
  }, 0);

  // At-risk goals (high/critical)
  const atRiskGoals = goals
    .filter((g) => {
      const latest = g.riskAssessments[0];
      return latest && (latest.riskLevel === 'high' || latest.riskLevel === 'critical');
    })
    .map((g) => ({
      id: g.id,
      title: g.title,
      riskLevel: g.riskAssessments[0]?.riskLevel ?? 'low',
      suggestedAction: g.riskAssessments[0]?.suggestedAction ?? null,
    }));

  // Today's blocks (missed or completed) — this user only.
  const todayBlocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: todayStart, lte: todayEnd },
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
  });
  const missedBlocksToday = todayBlocks.filter(
    (b) => b.status === 'missed' || (b.status === 'planned' && b.endAt < now)
  ).length;

  return NextResponse.json({
    now: now.toISOString(),
    date: now.toDateString(),
    today: {
      tasksCompleted: tasksCompletedToday,
      minutesInvested: minutesInvestedToday,
      completedTaskTitles: completedTaskTitles.slice(0, 5),
      missedBlocks: missedBlocksToday,
    },
    tomorrow: {
      blocksCount: tomorrowBlocks.length,
      minutesPlanned: Math.round(tomorrowMinutes),
      firstBlock: tomorrowBlocks[0]
        ? {
            startAt: tomorrowBlocks[0].startAt.toISOString(),
            title: tomorrowBlocks[0].task.title,
            goalTitle: tomorrowBlocks[0].task.goal.title,
          }
        : null,
      blocks: tomorrowBlocks.slice(0, 5).map((b) => ({
        id: b.id,
        startAt: b.startAt.toISOString(),
        endAt: b.endAt.toISOString(),
        title: b.task.title,
        goalTitle: b.task.goal.title,
      })),
    },
    atRiskGoals,
  });
}
