import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

const GoalCreateSchema = z.object({
  title: z.string().min(1).max(200),
  rawInput: z.string().max(5000).optional().nullable(),
  goalType: z.enum(['one_time', 'habit']).default('one_time'),
  deadline: z.string().datetime().optional().nullable(),
  category: z
    .enum(['work', 'study', 'personal', 'health', 'project', 'other'])
    .optional()
    .nullable(),
});

// GET /api/goals — list all goals for the authenticated user
export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const goals = await db.goal.findMany({
    where: { userId },
    include: {
      tasks: {
        select: {
          id: true,
          status: true,
          estimatedMinutes: true,
        },
      },
      riskAssessments: {
        orderBy: { assessedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { updatedAt: 'desc' }],
  });

  const formatted = goals.map((g) => {
    const total = g.tasks.length;
    const done = g.tasks.filter((t) => t.status === 'done').length;
    const remainingMinutes = g.tasks
      .filter((t) => t.status !== 'done' && t.status !== 'skipped')
      .reduce((s, t) => s + t.estimatedMinutes, 0);
    return {
      id: g.id,
      title: g.title,
      goalType: g.goalType,
      deadline: g.deadline?.toISOString() ?? null,
      status: g.status,
      rawInput: g.rawInput,
      category: g.category,
      priority: g.priority,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      doneTasks: done,
      totalTasks: total,
      remainingMinutes,
      latestRisk: g.riskAssessments[0] ?? null,
    };
  });

  return NextResponse.json({ goals: formatted });
}

// POST /api/goals — create a goal for the authenticated user
export async function POST(req: NextRequest) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const body = await req.json().catch(() => null);
  const parsed = GoalCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const d = parsed.data;

  try {
    const goal = await db.$transaction(async (tx) => {
      // 1. Try to atomically increment the goalCount for the user
      const updatedUser = await tx.user.updateMany({
        where: {
          id: userId,
          goalCount: { lt: 5 },
        },
        data: {
          goalCount: { increment: 1 },
        },
      });

      if (updatedUser.count === 0) {
        throw new Error('Goal limit reached');
      }

      // 2. Create the goal
      return await tx.goal.create({
        data: {
          userId,
          title: d.title,
          rawInput: d.rawInput ?? null,
          goalType: d.goalType,
          deadline: d.deadline ? new Date(d.deadline) : null,
          category: d.category ?? null,
        },
      });
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Goal limit reached') {
      return NextResponse.json(
        { error: 'Goal limit reached. You can have at most 5 goals. Please delete an existing goal first.' },
        { status: 400 }
      );
    }
    throw error;
  }
}
