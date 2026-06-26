'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, isToday as isDateToday, isSameDay } from 'date-fns';
import {
  formatBlockRange,
  formatMinutes,
  blockDurationMinutes,
  dayLabel,
} from '@/lib/format';

interface TimelineBlock {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  task: {
    id: string;
    title: string;
    estimatedMinutes: number;
    goalId: string;
    goalTitle: string;
    goalCategory: string | null;
  };
}

// Hour range to display: 6:00 → 23:00 (covers most working hours).
const START_HOUR = 6;
const END_HOUR = 23;
const HOURS = END_HOUR - START_HOUR; // 17 hours
const HOUR_PX = 56; // pixels per hour — tuned for mobile readability

const CATEGORY_COLORS: Record<string, { bar: string; tint: string; text: string }> = {
  work: { bar: 'bg-primary', tint: 'bg-primary/10', text: 'text-primary' },
  study: { bar: 'bg-chart-3', tint: 'bg-chart-3/10', text: 'text-chart-3' },
  personal: { bar: 'bg-chart-2', tint: 'bg-chart-2/10', text: 'text-chart-2' },
  health: { bar: 'bg-success', tint: 'bg-success/10', text: 'text-success' },
  project: { bar: 'bg-chart-4', tint: 'bg-chart-4/10', text: 'text-chart-4' },
  other: { bar: 'bg-muted-foreground', tint: 'bg-muted', text: 'text-muted-foreground' },
};

function colorFor(category: string | null) {
  return CATEGORY_COLORS[category ?? 'other'] ?? CATEGORY_COLORS.other;
}

export function WeeklyTimeline({ blocks }: { blocks: TimelineBlock[] }) {
  // Build 7 days starting today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Group blocks by day
  const blocksByDay = days.map((day) =>
    blocks.filter((b) => isSameDay(new Date(b.startAt), day))
  );

  const totalThisWeek = blocks.reduce(
    (s, b) => s + blockDurationMinutes(b.startAt, b.endAt),
    0
  );

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">
          Next 7 days · {format(today, 'd MMM')} – {format(days[6], 'd MMM')}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {formatMinutes(totalThisWeek)} planned
        </p>
      </div>

      {/* Horizontal scroll on mobile, fits on desktop */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px] sm:min-w-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {days.map((day, i) => {
              const isToday = isDateToday(day);
              const dayBlocks = blocksByDay[i];
              const dayMins = dayBlocks.reduce(
                (s, b) => s + blockDurationMinutes(b.startAt, b.endAt),
                0
              );
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'flex flex-col items-center rounded-md py-1.5',
                    isToday ? 'bg-primary/10' : 'bg-muted/40'
                  )}
                >
                  <span
                    className={cn(
                      'text-[0.6875rem] font-medium uppercase tracking-wider',
                      isToday ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {format(day, 'EEE')}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      isToday ? 'text-primary' : 'text-foreground'
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayMins > 0 && (
                    <span className="text-[0.625rem] text-muted-foreground">
                      {formatMinutes(dayMins)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hour grid + blocks */}
          <div className="relative mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
            {/* Hour lines (drawn once, spanning all columns via absolute layer) */}
            <div
              className="pointer-events-none absolute inset-x-0"
              style={{ top: 0, height: HOURS * HOUR_PX }}
              aria-hidden
            >
              {Array.from({ length: HOURS + 1 }).map((_, i) => {
                const hour = START_HOUR + i;
                return (
                  <div
                    key={i}
                    className="relative"
                    style={{ height: i === HOURS ? 0 : HOUR_PX }}
                  >
                    <div className="absolute inset-x-0 border-t border-border/60" />
                    {i < HOURS && (
                      <span className="absolute -left-0 -translate-x-full pr-1 text-[0.625rem] tabular-nums text-muted-foreground/70">
                        {hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Per-day columns */}
            {days.map((day, dayIdx) => {
              const dayBlocks = blocksByDay[dayIdx];
              return (
                <div
                  key={day.toISOString()}
                  className="relative"
                  style={{ height: HOURS * HOUR_PX }}
                >
                  {/* Faint column background */}
                  <div className="absolute inset-0 rounded-md bg-muted/20" />

                  {/* Blocks */}
                  {dayBlocks.map((b) => {
                    const start = new Date(b.startAt);
                    const end = new Date(b.endAt);
                    const startMin =
                      start.getHours() * 60 + start.getMinutes() - START_HOUR * 60;
                    const endMin =
                      end.getHours() * 60 + end.getMinutes() - START_HOUR * 60;
                    // Clamp to visible range
                    const clampedStart = Math.max(0, startMin);
                    const clampedEnd = Math.min(HOURS * 60, endMin);
                    if (clampedEnd <= clampedStart) return null;
                    const topPx = (clampedStart / 60) * HOUR_PX;
                    const heightPx = ((clampedEnd - clampedStart) / 60) * HOUR_PX;
                    const c = colorFor(b.task.goalCategory);
                    const isShort = heightPx < 36;
                    return (
                      <Link
                        key={b.id}
                        href={`/goals/${b.task.goalId}`}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-md border bg-card text-left transition-all hover:z-10 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          c.tint,
                          b.status === 'completed'
                            ? 'border-success/30 opacity-70'
                            : b.status === 'missed'
                              ? 'border-destructive/40'
                              : cn('border-border hover:border-primary/40'),
                          b.status === 'completed' && 'grayscale-[0.3]'
                        )}
                        style={{ top: topPx, height: heightPx }}
                        title={`${b.task.title} · ${formatBlockRange(b.startAt, b.endAt)}`}
                      >
                        <div className={cn('absolute inset-y-0 left-0 w-1', c.bar)} />
                        <div className="h-full pl-2 pr-1 py-0.5">
                          <p
                            className={cn(
                              'font-medium leading-tight',
                              isShort ? 'text-[0.625rem]' : 'text-[0.6875rem]'
                            )}
                          >
                            {b.task.title}
                          </p>
                          {!isShort && (
                            <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                              {formatBlockRange(b.startAt, b.endAt).split(' – ')[0]}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}

                  {/* "Now" indicator on today's column */}
                  {isDateToday(day) && (
                    <NowIndicator startHour={START_HOUR} hourPx={HOUR_PX} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function NowIndicator({ startHour, hourPx }: { startHour: number; hourPx: number }) {
  const now = new Date();
  const minSinceStart =
    now.getHours() * 60 + now.getMinutes() - startHour * 60;
  if (minSinceStart < 0 || minSinceStart > HOURS * 60) return null;
  const topPx = (minSinceStart / 60) * hourPx;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top: topPx }}
      aria-hidden
    >
      <div className="relative h-0.5 w-full bg-destructive">
        <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive shadow-sm" />
      </div>
    </div>
  );
}

void dayLabel;
