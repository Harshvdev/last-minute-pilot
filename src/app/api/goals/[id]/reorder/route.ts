import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const BodySchema = z.object({
  orderedTaskIds: z.array(z.string()).min(1),
});

// POST /api/goals/[id]/reorder
// Persist a new task order. The orderIndex of each task is set to its
// position in the orderedTaskIds array. Scoped to the authenticated user.
export async function POST(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const goal = await db.goal.findFirst({ where: { id, userId } });
  if (!goal) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const orderedTaskIds = parsed.data.orderedTaskIds;

  // Verify all tasks belong to this goal.
  const tasks = await db.task.findMany({
    where: { goalId: id, id: { in: orderedTaskIds } },
    select: { id: true },
  });
  if (tasks.length !== orderedTaskIds.length) {
    return NextResponse.json(
      { error: 'Some task IDs do not belong to this goal' },
      { status: 400 }
    );
  }

  // Update each task's orderIndex in a transaction.
  await db.$transaction(
    orderedTaskIds.map((taskId, idx) =>
      db.task.update({
        where: { id: taskId },
        data: { orderIndex: idx },
      })
    )
  );

  return NextResponse.json({ ok: true, orderedTaskIds });
}
