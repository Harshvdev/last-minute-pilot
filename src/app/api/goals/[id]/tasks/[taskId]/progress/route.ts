import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string; taskId: string }> };

const ProgressSchema = z.object({
  percentComplete: z.number().int().min(0).max(100),
  note: z.string().max(1000).optional().nullable(),
});

// POST /api/goals/[id]/tasks/[taskId]/progress
// Logs progress and auto-flips task status based on percent.
// Scoped to the authenticated user: verifies the task belongs to a goal owned
// by the user before recording progress.
export async function POST(req: NextRequest, { params }: Params) {
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

  const body = await req.json().catch(() => null);
  const parsed = ProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { percentComplete, note } = parsed.data;

  const log = await db.progressLog.create({
    data: {
      taskId,
      percentComplete,
      note: note ?? null,
    },
  });

  // Auto-flip task status.
  let newStatus: string | null = null;
  if (percentComplete >= 100) newStatus = 'done';
  else if (percentComplete > 0) newStatus = 'in_progress';

  let updatedTask = null;
  if (newStatus) {
    updatedTask = await db.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });
  }

  return NextResponse.json({ log, task: updatedTask }, { status: 201 });
}
