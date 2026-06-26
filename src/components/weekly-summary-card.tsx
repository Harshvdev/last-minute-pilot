'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, TrendingUp, Clock, Target, ArrowRight } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutes } from '@/lib/format';
import { format, eachDayOfInterval, subDays, isToday as isDateToday } from 'date-fns';

interface InsightsResponse {
  now: string;
  thisWeek: {
    completions: number;
    minutesInvested: number;
    activeGoals: number;
    weekStart: string;
    weekEnd: string;
  };
  dailyActivity: { date: string; count: number }[];
}

// A compact weekly summary card for the dashboard.
// Shows: this week's completions, time invested, active goals,
// and a 7-day activity bar chart with today highlighted.

export function WeeklySummaryCard() {
  const { data, isLoading } = useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: () => api('/api/insights'),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-24 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { thisWeek, dailyActivity } = data;
  const maxDaily = Math.max(...dailyActivity.map((d) => d.count), 1);
  const weekStartDate = new Date(data.thisWeek.weekStart);
  const weekEndDate = new Date(data.thisWeek.weekEnd);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CalendarRange className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">This week</CardTitle>
        </div>
        <Link
          href="/insights"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Insights
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Week date range */}
        <p className="text-xs text-muted-foreground">
          {format(weekStartDate, 'd MMM')} – {format(weekEndDate, 'd MMM')}
        </p>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-2">
          <WeekStat
            icon={Target}
            label="Done"
            value={String(thisWeek.completions)}
            tone="success"
          />
          <WeekStat
            icon={Clock}
            label="Focus"
            value={formatMinutes(thisWeek.minutesInvested)}
            tone="primary"
          />
          <WeekStat
            icon={TrendingUp}
            label="Goals"
            value={String(thisWeek.activeGoals)}
            tone="warning"
          />
        </div>

        {/* 7-day activity chart */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              Last 7 days
            </span>
            <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
              {dailyActivity.reduce((s, d) => s + d.count, 0)} logs
            </span>
          </div>
          <div className="flex items-end gap-1.5">
            {dailyActivity.map((day) => {
              const d = new Date(day.date + 'T00:00:00');
              const isToday = isDateToday(d);
              const heightPct = (day.count / maxDaily) * 100;
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${format(d, 'EEE d MMM')}: ${day.count} ${day.count === 1 ? 'log' : 'logs'}`}
                >
                  <span className="text-[0.625rem] font-semibold tabular-nums text-foreground">
                    {day.count > 0 ? day.count : ''}
                  </span>
                  <div className="flex h-12 w-full items-end overflow-hidden rounded bg-muted">
                    <div
                      className={cn(
                        'w-full rounded-t transition-all',
                        isToday ? 'bg-primary' : 'bg-primary/30'
                      )}
                      style={{
                        height: `${heightPct}%`,
                        minHeight: day.count > 0 ? '4px' : '0',
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[0.625rem] tabular-nums',
                      isToday ? 'font-semibold text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {format(d, 'EEE').slice(0, 1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const TONE_MAP = {
  success: 'bg-success/10 text-success',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning/15 text-warning-foreground',
} as const;

function WeekStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: keyof typeof TONE_MAP;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded',
            TONE_MAP[tone]
          )}
        >
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}
