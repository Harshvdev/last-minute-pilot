// GET /api/schedule/export-ics
// Exports today's + upcoming scheduled blocks as an iCalendar (.ics) file.
// Compatible with Google Calendar, Apple Calendar, Outlook.
// Scoped to the authenticated user — only exports the caller's own blocks.
import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/session';

// Format a Date as YYYYMMDDTHHMMSSZ (UTC).
function formatIcsDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

// Escape special characters per RFC 5545.
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Fold long lines to 75 octets per RFC 5545.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join('\r\n');
}

export async function GET() {
  const userIdOrResponse = await requireUser();
  if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
  const userId = userIdOrResponse;

  const now = new Date();
  // Export blocks from today through the next 30 days.
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  const until = new Date(since);
  until.setDate(until.getDate() + 30);

  const blocks = await db.scheduleBlock.findMany({
    where: {
      startAt: { gte: since, lte: until },
      status: { in: ['planned', 'completed'] },
      task: { goal: { userId } },
    },
    include: { task: { include: { goal: true } } },
    orderBy: { startAt: 'asc' },
  });

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Last Minute Pilot//Schedule Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Last Minute Pilot`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const b of blocks) {
    const start = b.startAt;
    const end = b.endAt;
    const title = `${b.task.title} · ${b.task.goal.title}`;
    const description = `Goal: ${b.task.goal.title}\nStatus: ${b.status}\nEstimated: ${b.task.estimatedMinutes} min\n\nFrom Last Minute Pilot — your AI deadline copilot.`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@last-minute-pilot`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      foldLine(`SUMMARY:${escapeIcsText(title)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
      foldLine(`CATEGORIES:${escapeIcsText(b.task.goal.category ?? 'other')}`),
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  const ics = lines.join('\r\n');

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="last-minute-pilot-${now.toISOString().slice(0, 10)}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
