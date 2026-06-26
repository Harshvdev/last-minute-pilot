import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prioritize } from '@/lib/scheduler/prioritize';
import { fitBlocks } from '@/lib/scheduler/fit-blocks';
import { requireUser } from '@/lib/auth/session';
import { fetchBusySlots, createCalendarEvent } from '@/lib/calendar/sync';
import type { AvailabilityRow, TaskRow, TaskStatus } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/goals/[id]/reschedule
// Runs the deterministic scheduler: prioritize → fitBlocks → write schedule_blocks.
// Also syncs with Google Calendar: fetches busy slots before scheduling, then
// writes the new blocks back as calendar events.
// Scoped to the authenticated user.
export async function POST(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  const goal = await db.goal.findFirst({
    where: { id, userId },
    include: { tasks: true, availability: true },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const now = new Date();
  const horizon = goal.deadline ?? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Fetch busy slots from Google Calendar (if connected).
  // This ensures we don't double-book the user's existing events.
  let busySlots: { start: Date; end: Date }[] = [];
  try {
    busySlots = await fetchBusySlots(userId, now, horizon);
  } catch {
    // Calendar not connected or fetch failed — proceed without it.
  }

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
    startTime: a.startTime,
    endTime: a.endTime,
    specificDate: a.specificDate ? a.specificDate.toISOString() : null,
  }));

  const ranked = prioritize(tasks, goal.deadline, now);
  const fit = fitBlocks({
    tasks: ranked,
    availability,
    start: now,
    deadline: goal.deadline,
    busySlots,
  });

  // Wipe future planned blocks for this goal's tasks (keep past completed/missed).
  await db.scheduleBlock.deleteMany({
    where: {
      task: { goalId: id },
      status: 'planned',
      startAt: { gt: now },
    },
  });

  // Write the new plan.
  const created = await db.$transaction(
    fit.scheduled.map((b) =>
      db.scheduleBlock.create({
        data: {
          taskId: b.taskId,
          startAt: b.startAt,
          endAt: b.endAt,
          status: 'planned',
        },
      })
    )
  );

  // Push the new blocks to Google Calendar (if connected).
  // This is non-blocking — if it fails, the blocks are still in the DB.
  // We use setImmediate-style fire-and-forget via Promise.allSettled.
  const taskMap = new Map(goal.tasks.map((t) => [t.id, t.title]));
  Promise.allSettled(
    created.map((block) => {
      const taskTitle = taskMap.get(block.taskId) ?? 'Task';
      return createCalendarEvent(
        userId,
        block.id,
        taskTitle,
        goal.title,
        block.startAt,
        block.endAt
      );
    })
  ).catch(() => {
    // Ignore — calendar sync is best-effort.
  });

  return NextResponse.json({
    scheduled: created,
    unscheduled: fit.unscheduled,
    totalMinutesPlanned: fit.totalMinutesPlanned,
    totalMinutesAvailable: fit.totalMinutesAvailable,
    calendarSynced: busySlots.length > 0,
  });
}
