import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// GET /api/streaks
// Computes daily progress streaks from progress logs + task completions.
//
// A "day" counts toward the streak if the user logged any progress (>=1%)
// OR marked any task as done that day. The streak is the count of consecutive
// days ending today (or yesterday if today has no activity yet).
//
// Also returns: longest streak, total active days, tasks done this week,
// and a 14-day activity heatmap (counts per day).
// Scoped to the authenticated user.
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // Pull all progress logs + task status updates for this user's active goals.
  const goals = await db.goal.findMany({
    where: { userId, status: 'active' },
    select: {
      id: true,
      tasks: {
        select: {
          id: true,
          status: true,
          updatedAt: true,
          progressLogs: { select: { loggedAt: true, percentComplete: true } },
        },
      },
    },
  });

  // Collect all activity timestamps.
  const activityDays = new Set<string>();
  let totalCompletions = 0;
  for (const goal of goals) {
    for (const task of goal.tasks) {
      for (const log of task.progressLogs) {
        if (log.percentComplete > 0) {
          activityDays.add(log.loggedAt.toISOString().slice(0, 10));
        }
        if (log.percentComplete >= 100) totalCompletions++;
      }
      if (task.status === 'done') {
        activityDays.add(task.updatedAt.toISOString().slice(0, 10));
      }
    }
  }

  // Compute current streak (ending today or yesterday).
  let currentStreak = 0;
  let cursor = new Date(today);
  // If today has no activity, start from yesterday so the streak isn't broken
  // just because the day hasn't started yet.
  if (!activityDays.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activityDays.has(cursor.toISOString().slice(0, 10))) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Compute longest streak by walking all activity days in order.
  const sortedDays = Array.from(activityDays).sort();
  let longestStreak = 0;
  let running = 0;
  let prev: Date | null = null;
  for (const dayStr of sortedDays) {
    const day = new Date(dayStr + 'T00:00:00');
    if (prev) {
      const diff = (day.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        running++;
      } else {
        running = 1;
      }
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prev = day;
  }

  // 14-day heatmap (oldest first), ending today.
  const heatmap: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    heatmap.push({ date: key, count: activityDays.has(key) ? 1 : 0 });
  }

  // This week's task completions (Mon-Sun).
  const weekStart = new Date(today);
  const dayOfWeek = weekStart.getDay(); // 0=Sun
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + offsetToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  let completionsThisWeek = 0;
  for (const goal of goals) {
    for (const task of goal.tasks) {
      for (const log of task.progressLogs) {
        if (
          log.percentComplete >= 100 &&
          log.loggedAt >= weekStart &&
          log.loggedAt < weekEnd
        ) {
          completionsThisWeek++;
        }
      }
    }
  }

  // Has the user done anything today?
  const activeToday = activityDays.has(today.toISOString().slice(0, 10));

  return NextResponse.json({
    now: now.toISOString(),
    currentStreak,
    longestStreak,
    totalActiveDays: activityDays.size,
    totalCompletions,
    completionsThisWeek,
    activeToday,
    heatmap,
  });
}
