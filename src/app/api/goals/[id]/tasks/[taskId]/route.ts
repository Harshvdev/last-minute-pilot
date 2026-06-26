import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string; taskId: string }> };

// PATCH /api/goals/[id]/tasks/[taskId] — update status / fields.
// Scoped to the authenticated user: verifies the task belongs to a goal owned
// by the user before updating.
export async function PATCH(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id, taskId } = await params;

  // Verify the task belongs to a goal owned by this user.
  const task = await db.task.findFirst({
    where: { id: taskId, goal: { id, userId } },
  });
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === 'string') data.title = body.title.slice(0, 200);
  if (typeof body.description === 'string')
    data.description = body.description.slice(0, 1000);
  if (typeof body.estimatedMinutes === 'number')
    data.estimatedMinutes = body.estimatedMinutes;
  if (
    typeof body.status === 'string' &&
    ['pending', 'in_progress', 'done', 'skipped'].includes(body.status)
  ) {
    data.status = body.status;
  }
  if (typeof body.orderIndex === 'number') data.orderIndex = body.orderIndex;
  if (body.dependsOnId === null || typeof body.dependsOnId === 'string')
    data.dependsOnId = body.dependsOnId;

  const updated = await db.task.update({ where: { id: taskId }, data });
  return NextResponse.json({ task: updated });
}

// DELETE /api/goals/[id]/tasks/[taskId]. Scoped to the authenticated user:
// verifies the task belongs to a goal owned by the user before deleting.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id, taskId } = await params;

  // Verify the task belongs to a goal owned by this user.
  const task = await db.task.findFirst({
    where: { id: taskId, goal: { id, userId } },
  });
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  await db.task.delete({ where: { id: taskId } });
  return NextResponse.json({ ok: true });
}
