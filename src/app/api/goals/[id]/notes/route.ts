import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const NoteCreateSchema = z.object({
  body: z.string().min(1).max(10000),
});

// GET /api/goals/[id]/notes — list notes for a goal (newest first).
// Scoped to the authenticated user.
export async function GET(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before listing notes.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }
  const notes = await db.note.findMany({
    where: { goalId: id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    notes: notes.map((n) => ({
      id: n.id,
      goalId: n.goalId,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  });
}

// POST /api/goals/[id]/notes — create a note. Scoped to the authenticated user.
export async function POST(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before creating a note.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const note = await db.note.create({
    data: { goalId: id, body: parsed.data.body },
  });
  return NextResponse.json(
    {
      note: {
        id: note.id,
        goalId: note.goalId,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
