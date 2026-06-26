'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Gauge, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutes, formatDeadlineRelative } from '@/lib/format';

interface ProjectionResponse {
  now: string;
  overall: {
    verdict: 'on-track' | 'slightly-behind' | 'behind' | 'will-miss' | 'unknown';
    totalRemainingWork: number;
    totalRemainingTime: number;
    totalRemainingTasks: number;
    goalsBehind: number;
    ratio: number;
  };
  perGoal: Array<{
    goalId: string;
    goalTitle: string;
    deadline: string | null;
    projection: {
      velocity: number;
      remainingTasks: number;
      remainingWork: number;
      remainingTime: number;
      forecastedFinish: string | null;
      daysDelta: number | null;
      verdict: 'on-track' | 'slightly-behind' | 'behind' | 'will-miss' | 'unknown';
      summary: string;
      confidence: 'low' | 'medium' | 'high';
    };
  }>;
}

const VERDICT_STYLES = {
  'on-track': {
    label: 'On pace',
    icon: ArrowUpRight,
    ring: 'border-success/30 bg-success/5',
    badge: 'bg-success/10 text-success border-success/20',
    accent: 'text-success',
    bar: 'bg-success',
  },
  'slightly-behind': {
    label: 'Slightly behind',
    icon: Minus,
    ring: 'border-warning/30 bg-warning/5',
    badge: 'bg-warning/15 text-warning-foreground border-warning/30',
    accent: 'text-warning',
    bar: 'bg-warning',
  },
  behind: {
    label: 'Behind',
    icon: ArrowDownRight,
    ring: 'border-warning/40 bg-warning/10',
    badge: 'bg-warning/15 text-warning-foreground border-warning/30',
    accent: 'text-warning',
    bar: 'bg-warning',
  },
  'will-miss': {
    label: 'Will miss',
    icon: ArrowDownRight,
    ring: 'border-destructive/40 bg-destructive/5',
    badge: 'bg-destructive/10 text-destructive border-destructive/20',
    accent: 'text-destructive',
    bar: 'bg-destructive',
  },
  unknown: {
    label: 'No data',
    icon: Gauge,
    ring: 'border-border bg-muted/30',
    badge: 'bg-muted text-muted-foreground border-border',
    accent: 'text-muted-foreground',
    bar: 'bg-muted-foreground',
  },
} as const;

export function PaceProjectionCard() {
  const { data, isLoading } = useQuery<ProjectionResponse>({
    queryKey: ['projection'],
    queryFn: () => api('/api/projection'),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.perGoal.length === 0) {
    return null;
  }

  const overall = data.overall;
  const style = VERDICT_STYLES[overall.verdict];
  const Icon = style.icon;
  const ratio = isFinite(overall.ratio) ? overall.ratio : 0;
  // Bar shows how much of available time is consumed by work (capped at 100%).
  const fillPct = Math.min(100, Math.round(ratio * 100));

  return (
    <Card className={cn('border-l-4', style.ring, 'border-l-' + 'transparent')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold">
              Pace projection
            </CardTitle>
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
              style.badge
            )}
          >
            <Icon className="h-3 w-3" />
            {style.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Overall headline */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Work vs free time</p>
              <p className="text-sm text-foreground">
                <span className="font-semibold tabular-nums">
                  {formatMinutes(overall.totalRemainingWork)}
                </span>
                <span className="text-muted-foreground"> of work · </span>
                <span className="font-semibold tabular-nums">
                  {formatMinutes(overall.totalRemainingTime)}
                </span>
                <span className="text-muted-foreground"> free</span>
              </p>
            </div>
            {overall.goalsBehind > 0 && (
              <p className="shrink-0 text-xs text-destructive">
                {overall.goalsBehind} goal{overall.goalsBehind === 1 ? '' : 's'} behind
              </p>
            )}
          </div>
          {/* Work-vs-time bar */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', style.bar)}
              style={{ width: `${fillPct}%` }}
            />
            {/* 100% marker */}
            <div className="absolute inset-y-0 right-0 w-px bg-border" />
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            {overall.verdict === 'on-track'
              ? 'Work fits comfortably in your available windows.'
              : overall.verdict === 'will-miss'
                ? 'At your current pace, some work will not fit before deadlines.'
                : 'Work is tight against your available windows.'}
          </p>
        </div>

        {/* Per-goal projections */}
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Per goal
          </p>
          <ul className="space-y-1.5">
            {data.perGoal
              .slice()
              .sort((a, b) => {
                const order = {
                  'will-miss': 0,
                  behind: 1,
                  'slightly-behind': 2,
                  unknown: 3,
                  'on-track': 4,
                } as const;
                return order[a.projection.verdict] - order[b.projection.verdict];
              })
              .slice(0, 4)
              .map((g) => {
                const s = VERDICT_STYLES[g.projection.verdict];
                const GIcon = s.icon;
                return (
                  <li
                    key={g.goalId}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        s.badge
                      )}
                    >
                      <GIcon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-xs font-medium text-foreground">
                        {g.goalTitle}
                      </p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {g.projection.summary}
                      </p>
                      {g.projection.forecastedFinish && (
                        <p className="text-[0.6875rem] text-muted-foreground">
                          Forecast finish:{' '}
                          {new Date(g.projection.forecastedFinish).toLocaleDateString(
                            'en-US',
                            { month: 'short', day: 'numeric' }
                          )}
                          {g.deadline && (
                            <>
                              {' '}
                              · deadline{' '}
                              {formatDeadlineRelative(g.deadline)}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
