import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

// GET /api/goals/[id] — full goal with tasks, availability, latest risk
// Scoped to the authenticated user — users can only see their own goals.
export async function GET(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  const goal = await db.goal.findFirst({
    where: { id, userId },
    include: {
      tasks: {
        include: {
          scheduleBlocks: { orderBy: { startAt: 'asc' } },
          progressLogs: { orderBy: { loggedAt: 'desc' }, take: 10 },
        },
        orderBy: { orderIndex: 'asc' },
      },
      availability: { orderBy: { createdAt: 'asc' } },
      riskAssessments: {
        orderBy: { assessedAt: 'desc' },
        take: 10,
      },
      notes: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }
  return NextResponse.json({ goal });
}

// PATCH /api/goals/[id] — update fields (scoped to the authenticated user)
export async function PATCH(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before updating.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};
  if (typeof body.title === 'string') allowed.title = body.title.slice(0, 200);
  if (typeof body.rawInput === 'string')
    allowed.rawInput = body.rawInput.slice(0, 5000);
  if (body.goalType === 'one_time' || body.goalType === 'habit')
    allowed.goalType = body.goalType;
  if (body.deadline === null || typeof body.deadline === 'string') {
    allowed.deadline = body.deadline ? new Date(body.deadline) : null;
  }
  if (
    body.category === null ||
    ['work', 'study', 'personal', 'health', 'project', 'other'].includes(
      body.category
    )
  ) {
    allowed.category = body.category;
  }
  if (typeof body.priority === 'number' && body.priority >= 0 && body.priority <= 100) {
    allowed.priority = body.priority;
  }
  if (
    typeof body.status === 'string' &&
    ['active', 'completed', 'abandoned'].includes(body.status)
  ) {
    allowed.status = body.status;
  }
  const updated = await db.goal.update({
    where: { id },
    data: allowed,
  });
  return NextResponse.json({ goal: updated });
}

// DELETE /api/goals/[id] — cascade delete (scoped to the authenticated user)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before deleting.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }
  await db.$transaction([
    db.goal.delete({ where: { id } }),
    db.user.update({
      where: { id: userId },
      data: { goalCount: { decrement: 1 } },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
