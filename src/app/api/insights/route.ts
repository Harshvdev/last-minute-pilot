import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { format, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval } from 'date-fns';
import { requireUser } from '@/lib/auth/session';

// GET /api/insights
// Weekly analytics: task completion trends, category breakdown, time invested,
// peak productivity hours, and a 4-week trend.
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const now = new Date();

  // Pull all progress logs + tasks for this user's goals (active + completed).
  const goals = await db.goal.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      category: true,
      goalType: true,
      status: true,
      deadline: true,
      createdAt: true,
      tasks: {
        select: {
          id: true,
          status: true,
          estimatedMinutes: true,
          createdAt: true,
          updatedAt: true,
          progressLogs: { select: { loggedAt: true, percentComplete: true } },
        },
      },
    },
  });

  // --- 4-week completion trend ---
  const weeks: { label: string; completions: number; minutesInvested: number }[] = [];
  for (let i = 3; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    let completions = 0;
    let minutesInvested = 0;
    for (const goal of goals) {
      for (const task of goal.tasks) {
        for (const log of task.progressLogs) {
          if (log.percentComplete >= 100 && log.loggedAt >= weekStart && log.loggedAt <= weekEnd) {
            completions++;
            minutesInvested += task.estimatedMinutes;
          }
        }
      }
    }
    weeks.push({
      label: format(weekStart, 'd MMM'),
      completions,
      minutesInvested,
    });
  }

  // --- Category breakdown ---
  const categoryStats: Record<string, { goals: number; tasksDone: number; minutesInvested: number }> = {};
  for (const goal of goals) {
    const cat = goal.category ?? 'other';
    if (!categoryStats[cat]) categoryStats[cat] = { goals: 0, tasksDone: 0, minutesInvested: 0 };
    categoryStats[cat].goals++;
    for (const task of goal.tasks) {
      if (task.status === 'done') {
        categoryStats[cat].tasksDone++;
        categoryStats[cat].minutesInvested += task.estimatedMinutes;
      }
    }
  }
  const categories = Object.entries(categoryStats)
    .map(([cat, stats]) => ({ category: cat, ...stats }))
    .sort((a, b) => b.tasksDone - a.tasksDone);

  // --- Peak productivity hours (based on progress log timestamps) ---
  const hourBuckets: number[] = new Array(24).fill(0);
  for (const goal of goals) {
    for (const task of goal.tasks) {
      for (const log of task.progressLogs) {
        if (log.percentComplete > 0) {
          hourBuckets[log.loggedAt.getHours()]++;
        }
      }
    }
  }
  const peakHours = hourBuckets
    .map((count, hour) => ({ hour, count }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // --- This week's summary ---
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  let thisWeekCompletions = 0;
  let thisWeekMinutes = 0;
  let thisWeekActiveGoals = new Set<string>();
  for (const goal of goals) {
    for (const task of goal.tasks) {
      for (const log of task.progressLogs) {
        if (log.percentComplete >= 100 && log.loggedAt >= thisWeekStart && log.loggedAt <= thisWeekEnd) {
          thisWeekCompletions++;
          thisWeekMinutes += task.estimatedMinutes;
          thisWeekActiveGoals.add(goal.id);
        }
      }
    }
  }

  // --- Last 7 days activity (for the sparkline) ---
  const last7Days = eachDayOfInterval({
    start: subWeeks(now, 1),
    end: now,
  });
  const dailyActivity: { date: string; count: number }[] = last7Days.map((d) => {
    const dayStr = d.toISOString().slice(0, 10);
    let count = 0;
    for (const goal of goals) {
      for (const task of goal.tasks) {
        for (const log of task.progressLogs) {
          if (log.percentComplete > 0 && log.loggedAt.toISOString().slice(0, 10) === dayStr) {
            count++;
          }
        }
      }
    }
    return { date: dayStr, count };
  });

  // --- Totals ---
  const totalGoals = goals.length;
  const totalActiveGoals = goals.filter((g) => g.status === 'active').length;
  const totalCompletedGoals = goals.filter((g) => g.status === 'completed').length;
  const totalTasksDone = goals.reduce(
    (s, g) => s + g.tasks.filter((t) => t.status === 'done').length,
    0
  );
  const totalMinutesInvested = goals.reduce(
    (s, g) => s + g.tasks.filter((t) => t.status === 'done').reduce((ts, t) => ts + t.estimatedMinutes, 0),
    0
  );

  return NextResponse.json({
    now: now.toISOString(),
    summary: {
      totalGoals,
      totalActiveGoals,
      totalCompletedGoals,
      totalTasksDone,
      totalMinutesInvested,
    },
    thisWeek: {
      completions: thisWeekCompletions,
      minutesInvested: thisWeekMinutes,
      activeGoals: thisWeekActiveGoals.size,
      weekStart: thisWeekStart.toISOString(),
      weekEnd: thisWeekEnd.toISOString(),
    },
    weeks,
    categories,
    peakHours,
    dailyActivity,
  });
}
