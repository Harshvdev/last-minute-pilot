import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string; noteId: string }> };

const NoteUpdateSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
});

// PATCH /api/goals/[id]/notes/[noteId] — update a note.
// Scoped to the authenticated user: verifies the note belongs to a goal owned
// by the user before updating.
export async function PATCH(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id, noteId } = await params;

  // Verify the note belongs to a goal owned by this user.
  const note = await db.note.findFirst({
    where: { id: noteId, goal: { id, userId } },
  });
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = NoteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data: Record<string, unknown> = {};
  if (typeof parsed.data.body === 'string') data.body = parsed.data.body;
  const updated = await db.note.update({ where: { id: noteId }, data });
  return NextResponse.json({
    note: {
      id: updated.id,
      goalId: updated.goalId,
      body: updated.body,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/goals/[id]/notes/[noteId]. Scoped to the authenticated user:
// verifies the note belongs to a goal owned by the user before deleting.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id, noteId } = await params;

  // Verify the note belongs to a goal owned by this user.
  const note = await db.note.findFirst({
    where: { id: noteId, goal: { id, userId } },
  });
  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  }

  await db.note.delete({ where: { id: noteId } });
  return NextResponse.json({ ok: true });
}
