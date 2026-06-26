'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  TrendingUp,
  Clock,
  Target,
  CheckCircle2,
  Trophy,
  Zap,
  BarChart3,
  PieChart,
  Sparkles,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutes, CATEGORIES } from '@/lib/format';

interface InsightsResponse {
  now: string;
  summary: {
    totalGoals: number;
    totalActiveGoals: number;
    totalCompletedGoals: number;
    totalTasksDone: number;
    totalMinutesInvested: number;
  };
  thisWeek: {
    completions: number;
    minutesInvested: number;
    activeGoals: number;
  };
  weeks: { label: string; completions: number; minutesInvested: number }[];
  categories: { category: string; goals: number; tasksDone: number; minutesInvested: number }[];
  peakHours: { hour: number; count: number }[];
  dailyActivity: { date: string; count: number }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  work: 'var(--chart-1)',
  study: 'var(--chart-3)',
  personal: 'var(--chart-2)',
  health: 'var(--success)',
  project: 'var(--chart-4)',
  other: 'var(--muted-foreground)',
};

const CATEGORY_BAR_COLORS: Record<string, string> = {
  work: 'bg-primary',
  study: 'bg-chart-3',
  personal: 'bg-chart-2',
  health: 'bg-success',
  project: 'bg-chart-4',
  other: 'bg-muted-foreground',
};

export default function InsightsPage() {
  const { data, isLoading } = useQuery<InsightsResponse>({
    queryKey: ['insights'],
    queryFn: () => api('/api/insights'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) return null;

  const maxWeekCompletions = Math.max(...data.weeks.map((w) => w.completions), 1);
  const maxDailyActivity = Math.max(...data.dailyActivity.map((d) => d.count), 1);
  const totalMinutesAll = data.categories.reduce((s, c) => s + c.minutesInvested, 0);
  const hasCategoryData = totalMinutesAll > 0;
  const hasWeeklyData = data.weeks.some((w) => w.completions > 0);
  const maxPeakCount = Math.max(...data.peakHours.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Insights
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Your productivity trends, category breakdown, and peak hours.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <SummaryTile
          label="Tasks done"
          value={data.summary.totalTasksDone}
          icon={CheckCircle2}
          accent="success"
        />
        <SummaryTile
          label="Time invested"
          value={formatMinutes(data.summary.totalMinutesInvested)}
          icon={Clock}
          accent="primary"
        />
        <SummaryTile
          label="Goals completed"
          value={data.summary.totalCompletedGoals}
          icon={Trophy}
          accent="warning"
        />
        <SummaryTile
          label="Active goals"
          value={data.summary.totalActiveGoals}
          icon={Target}
          accent="primary"
        />
      </div>

      {/* This week highlight */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">This week</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {data.thisWeek.completions}
              </span>{' '}
              tasks done across{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {data.thisWeek.activeGoals}
              </span>{' '}
              {data.thisWeek.activeGoals === 1 ? 'goal' : 'goals'} ·{' '}
              {formatMinutes(data.thisWeek.minutesInvested)} invested
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 4-week trend + 7-day sparkline side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">
                4-week completion trend
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {hasWeeklyData ? (
              <div className="flex items-end justify-between gap-3 pt-2">
                {data.weeks.map((week, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {week.completions}
                    </span>
                    <div className="flex h-32 w-full items-end overflow-hidden rounded-md bg-muted">
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all',
                          i === data.weeks.length - 1 ? 'bg-primary' : 'bg-primary/40'
                        )}
                        style={{
                          height: `${(week.completions / maxWeekCompletions) * 100}%`,
                          minHeight: week.completions > 0 ? '4px' : '0',
                        }}
                      />
                    </div>
                    <span className="text-[0.625rem] text-muted-foreground">
                      {week.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyChartState
                message="No completions in the past 4 weeks yet"
                hint="Mark a task complete to start filling this chart."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              Last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-end gap-1.5">
              {data.dailyActivity.map((day) => {
                const d = new Date(day.date + 'T00:00:00');
                const isToday = day.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[0.625rem] font-semibold tabular-nums text-foreground">
                      {day.count > 0 ? day.count : ''}
                    </span>
                    <div className="flex h-16 w-full items-end overflow-hidden rounded bg-muted">
                      <div
                        className={cn(
                          'w-full rounded-t transition-all',
                          isToday ? 'bg-primary' : 'bg-primary/30'
                        )}
                        style={{
                          height: `${(day.count / maxDailyActivity) * 100}%`,
                          minHeight: day.count > 0 ? '4px' : '0',
                        }}
                      />
                    </div>
                    <span className="text-[0.5rem] tabular-nums text-muted-foreground">
                      {format(d, 'EEE').slice(0, 1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown with donut chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">
              Time by category
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!hasCategoryData ? (
            <EmptyChartState
              message="No completed work yet"
              hint="Finish a task to see your category time distribution."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <CategoryDonut
                categories={data.categories}
                totalMinutes={totalMinutesAll}
              />
              <div className="space-y-3">
                {data.categories.map((cat) => {
                  const label =
                    CATEGORIES.find((c) => c.value === cat.category)?.label ??
                    cat.category;
                  const color = CATEGORY_BAR_COLORS[cat.category] ?? 'bg-muted-foreground';
                  const maxTasks = Math.max(...data.categories.map((c) => c.tasksDone), 1);
                  return (
                    <div key={cat.category} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <span className={cn('h-2.5 w-2.5 rounded-sm', color)} />
                          {label}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          <span className="font-semibold text-foreground">
                            {cat.tasksDone}
                          </span>{' '}
                          done · {formatMinutes(cat.minutesInvested)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', color)}
                          style={{ width: `${(cat.tasksDone / maxTasks) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Peak hours */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">
              Peak productivity hours
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {data.peakHours.length === 0 ? (
            <EmptyChartState
              message="No progress logs yet"
              hint="Log progress on a task to learn when you're most productive."
            />
          ) : (
            <ul className="space-y-2">
              {data.peakHours.map((ph, i) => {
                const pct = (ph.count / maxPeakCount) * 100;
                return (
                  <li
                    key={ph.hour}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-12 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums',
                        i === 0
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-primary/10 text-primary'
                      )}
                    >
                      {ph.hour === 0 ? '12a' : ph.hour < 12 ? `${ph.hour}a` : ph.hour === 12 ? '12p' : `${ph.hour - 12}p`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          {i === 0 ? 'Most productive' : `Rank #${i + 1}`}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">
                          {ph.count} logs
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            i === 0 ? 'bg-primary' : 'bg-primary/40'
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChartState({ message, hint }: { message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function CategoryDonut({
  categories,
  totalMinutes,
}: {
  categories: { category: string; minutesInvested: number }[];
  totalMinutes: number;
}) {
  const size = 180;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // Pre-compute segments with running offsets using reduce to avoid reassigning.
  const { segments, count } = categories
    .filter((c) => c.minutesInvested > 0)
    .reduce(
      (acc, c) => {
        const fraction = c.minutesInvested / totalMinutes;
        const dash = fraction * circumference;
        const seg = {
          category: c.category,
          color: CATEGORY_COLORS[c.category] ?? 'var(--muted-foreground)',
          dash,
          gap: circumference - dash,
          offset: -acc.runningOffset,
        };
        return {
          runningOffset: acc.runningOffset + dash,
          segments: [...acc.segments, seg],
          count: acc.count + 1,
        };
      },
      { runningOffset: 0, segments: [] as Array<{ category: string; color: string; dash: number; gap: number; offset: number }>, count: 0 }
    );

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-label="Time invested by category"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={stroke}
          />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
            Total
          </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {formatMinutes(totalMinutes)}
          </span>
          <span className="text-[0.625rem] text-muted-foreground">
            across {count} {count === 1 ? 'category' : 'categories'}
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'primary' | 'success' | 'warning';
}) {
  const accentMap = {
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
  } as const;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={cn('h-4 w-4', accentMap[accent])} />
        </div>
        <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
