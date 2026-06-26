import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const AvailabilitySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().optional(),
      dayOfWeek: z.number().int().min(0).max(6).nullable(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
      specificDate: z.string().datetime().nullable(),
    })
  ),
});

// PUT /api/goals/[id]/availability — replace all availability for a goal.
// Scoped to the authenticated user.
export async function PUT(req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before mutating.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  await db.availability.deleteMany({ where: { goalId: id } });

  const created = await db.$transaction(
    parsed.data.items
      .filter(
        (i) =>
          (i.dayOfWeek !== null && i.startTime && i.endTime) ||
          (i.specificDate !== null && i.startTime && i.endTime)
      )
      .map((i) =>
        db.availability.create({
          data: {
            goalId: id,
            dayOfWeek: i.dayOfWeek,
            startTime: i.startTime,
            endTime: i.endTime,
            specificDate: i.specificDate ? new Date(i.specificDate) : null,
          },
        })
      )
  );

  return NextResponse.json({ availability: created });
}

// GET /api/goals/[id]/availability. Scoped to the authenticated user.
export async function GET(_req: NextRequest, { params }: Params) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const { id } = await params;
  // Verify ownership before returning availability.
  const existing = await db.goal.findFirst({ where: { id, userId } });
  if (!existing) {
    return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
  }
  const availability = await db.availability.findMany({
    where: { goalId: id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ availability });
}
