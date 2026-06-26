import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const TaskCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  estimatedMinutes: z.number().int().min(5).max(60 * 24).default(30),
  dependsOnId: z.string().optional().nullable(),
});

// GET /api/goals/[id]/tasks. Scoped to the authenticated user.
export async function GET(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before listing tasks.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }
  const tasks = await db.task.findMany({
    where: { goalId: id },
    include: {
      scheduleBlocks: { orderBy: { startAt: 'asc' } },
      progressLogs: { orderBy: { loggedAt: 'desc' }, take: 5 },
    },
    orderBy: [{ orderIndex: 'asc' }],
  });
  return NextResponse.json({ tasks });
}

// POST /api/goals/[id]/tasks — create a single task. Scoped to the authenticated user.
export async function POST(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before creating a task.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = TaskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const count = await db.task.count({ where: { goalId: id } });
  const task = await db.task.create({
    data: {
      goalId: id,
      title: d.title,
      description: d.description ?? null,
      estimatedMinutes: d.estimatedMinutes,
      dependsOnId: d.dependsOnId ?? null,
      orderIndex: count,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
