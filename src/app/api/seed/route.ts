import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// POST /api/seed
// Seeds a few demo goals + tasks + availability so the app is not empty on
// first visit. Idempotent per user: skips if the user already has goals.
// Scoped to the authenticated user — all created goals are owned by the user.
export async function POST() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const existing = await db.goal.count({ where: { userId } });
  if (existing > 0) {
    return NextResponse.json({ ok: true, seeded: false, reason: 'already has goals' });
  }

  const now = new Date();

  // Goal 1 — one-time, urgent
  const hackathon = await db.goal.create({
    data: {
      userId,
      title: 'Ship hackathon MVP',
      rawInput:
        'I have a hackathon this weekend. I have not started. Need a demo by Sunday 6pm.',
      goalType: 'one_time',
      category: 'project',
      deadline: new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000),
    },
  });
  await db.availability.createMany({
    data: [
      { goalId: hackathon.id, dayOfWeek: 1, startTime: '18:00', endTime: '22:00' },
      { goalId: hackathon.id, dayOfWeek: 2, startTime: '18:00', endTime: '22:00' },
      { goalId: hackathon.id, dayOfWeek: 3, startTime: '18:00', endTime: '22:00' },
      { goalId: hackathon.id, dayOfWeek: 4, startTime: '18:00', endTime: '22:00' },
      { goalId: hackathon.id, dayOfWeek: 5, startTime: '18:00', endTime: '23:00' },
      { goalId: hackathon.id, dayOfWeek: 6, startTime: '09:00', endTime: '18:00' },
    ],
  });
  const hackTasks = [
    ['Scope the demo: 1 hero feature', 30, null],
    ['Sketch UI on paper', 45, 0],
    ['Bootstrap Next.js + DB schema', 60, 1],
    ['Build hero feature end-to-end', 180, 2],
    ['Write the pitch script', 45, 3],
    ['Rehearse demo twice', 30, 4],
    ['Deploy to Vercel', 30, 3],
  ] as const;
  let prevId: string | null = null;
  for (let i = 0; i < hackTasks.length; i++) {
    const [title, mins, depIdx] = hackTasks[i];
    const t = await db.task.create({
      data: {
        goalId: hackathon.id,
        title,
        estimatedMinutes: mins as number,
        orderIndex: i,
        dependsOnId: i === 0 ? null : prevId,
        status: i === 0 ? 'done' : i === 1 ? 'in_progress' : 'pending',
      },
    });
    prevId = t.id;
  }

  // Goal 2 — habit
  const running = await db.goal.create({
    data: {
      userId,
      title: 'Run 3x per week',
      rawInput: 'Build a running habit — 3 short runs a week, 30 min each.',
      goalType: 'habit',
      category: 'health',
    },
  });
  await db.availability.createMany({
    data: [
      { goalId: running.id, dayOfWeek: 1, startTime: '06:30', endTime: '07:15' },
      { goalId: running.id, dayOfWeek: 3, startTime: '06:30', endTime: '07:15' },
      { goalId: running.id, dayOfWeek: 5, startTime: '06:30', endTime: '07:15' },
    ],
  });
  const runTasks = [
    ['Easy 3km run', 30, null],
    ['Interval run', 30, null],
    ['Long slow run', 45, null],
  ] as const;
  for (let i = 0; i < runTasks.length; i++) {
    await db.task.create({
      data: {
        goalId: running.id,
        title: runTasks[i][0],
        estimatedMinutes: runTasks[i][1] as number,
        orderIndex: i,
        status: 'pending',
      },
    });
  }

  // Goal 3 — study
  const study = await db.goal.create({
    data: {
      userId,
      title: 'Finish distributed systems chapter',
      rawInput: 'Read + take notes on the consistency chapter before next Friday class.',
      goalType: 'one_time',
      category: 'study',
      deadline: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    },
  });
  await db.availability.createMany({
    data: [
      { goalId: study.id, dayOfWeek: 2, startTime: '20:00', endTime: '22:00' },
      { goalId: study.id, dayOfWeek: 4, startTime: '20:00', endTime: '22:00' },
      { goalId: study.id, dayOfWeek: 0, startTime: '10:00', endTime: '12:00' },
    ],
  });
  const studyTasks = [
    ['Skim the chapter headings', 20, null],
    ['Read sections 1-3', 90, 0],
    ['Read sections 4-6', 90, 1],
    ['Take structured notes', 60, 2],
    ['Work through the exercises', 75, 3],
  ] as const;
  let prevStudy: string | null = null;
  for (let i = 0; i < studyTasks.length; i++) {
    const t = await db.task.create({
      data: {
        goalId: study.id,
        title: studyTasks[i][0],
        estimatedMinutes: studyTasks[i][1] as number,
        orderIndex: i,
        dependsOnId: i === 0 ? null : prevStudy,
        status: 'pending',
      },
    });
    prevStudy = t.id;
  }

  return NextResponse.json({
    ok: true,
    seeded: true,
    goals: [hackathon.id, running.id, study.id],
  });
}
