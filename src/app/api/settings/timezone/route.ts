import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';

// POST /api/settings/timezone
export async function POST(req: NextRequest) {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  try {
    const { timezone } = await req.json();
    if (!timezone) {
      return NextResponse.json({ error: 'Timezone is required' }, { status: 400 });
    }

    // Validate timezone string
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }

    await db.user.update({
      where: { id: userId },
      data: { timezone },
    });

    return NextResponse.json({ success: true, timezone });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
