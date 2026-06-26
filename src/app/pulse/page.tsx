'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  Loader2,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  Filter,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/risk-badge';
import { ProgressBar } from '@/components/progress-bar';
import { RiskTrendSparkline } from '@/components/risk-trend-sparkline';
import {
  formatMinutes,
  formatDeadlineRelative,
} from '@/lib/format';
import type { RiskLevel } from '@/lib/types';

interface PulseResponse {
  now: string;
  summary: {
    totalActiveGoals: number;
    totalTasks: number;
    doneTasks: number;
    criticalGoals: number;
    todayBlocksCount: number;
  };
  goals: Array<{
    id: string;
    title: string;
    category: string | null;
    goalType: string;
    deadline: string | null;
    progress: number;
    doneTasks: number;
    totalTasks: number;
    remainingMinutes: number;
    riskLevel: RiskLevel;
    remainingWork: number;
    remainingTime: number;
    latestRisk: {
      id: string;
      riskLevel: RiskLevel;
      reason: string | null;
      suggestedAction: string | null;
      assessedAt: string;
      remainingWork: number;
      remainingTime: number;
    } | null;
    riskHistory: { id: string; riskLevel: RiskLevel; assessedAt: string }[];
  }>;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type RiskFilter = 'all' | RiskLevel;

const FILTER_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'Behind' },
  { value: 'medium', label: 'Watch' },
  { value: 'low', label: 'On track' },
];

export default function PulsePage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery<PulseResponse>({
    queryKey: ['pulse'],
    queryFn: () => api('/api/stats'),
    refetchInterval: 60_000,
  });

  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>('all');

  const replanMutation = useMutation({
    mutationFn: () =>
      api<{ goalsProcessed: number; results: Array<{ goalTitle: string; riskLevel: string; explanation: string | null }> }>(
        '/api/schedule/replan',
        { method: 'POST' }
      ),
    onSuccess: (res) => {
      toast.success(
        `Replanned ${res.goalsProcessed} goal${res.goalsProcessed === 1 ? '' : 's'}.`
      );
      qc.invalidateQueries({ queryKey: ['pulse'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(`Replan failed: ${e.message}`),
  });

  const sortedGoals = React.useMemo(() => {
    if (!data) return [];
    return [...data.goals].sort(
      (a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]
    );
  }, [data]);

  const filteredGoals = React.useMemo(() => {
    if (riskFilter === 'all') return sortedGoals;
    return sortedGoals.filter((g) => g.riskLevel === riskFilter);
  }, [sortedGoals, riskFilter]);

  const counts = React.useMemo(() => {
    if (!data) return { critical: 0, high: 0, medium: 0, low: 0 };
    return data.goals.reduce(
      (acc, g) => {
        acc[g.riskLevel]++;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0 } as Record<RiskLevel, number>
    );
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Pulse
          </h1>
          <p className="text-sm text-muted-foreground">
            Live risk for every active goal. The copilot writes new
            assessments when risk escalates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={() => replanMutation.mutate()}
            disabled={replanMutation.isPending}
            className="gap-1.5"
          >
            {replanMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Replan all
          </Button>
        </div>
      </div>

      {/* Risk distribution */}
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : (
        data && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Risk distribution
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <RiskStat
                  label="Critical"
                  count={counts.critical}
                  level="critical"
                  onClick={() => setRiskFilter(riskFilter === 'critical' ? 'all' : 'critical')}
                  active={riskFilter === 'critical'}
                />
                <RiskStat
                  label="Behind"
                  count={counts.high}
                  level="high"
                  onClick={() => setRiskFilter(riskFilter === 'high' ? 'all' : 'high')}
                  active={riskFilter === 'high'}
                />
                <RiskStat
                  label="Watch"
                  count={counts.medium}
                  level="medium"
                  onClick={() => setRiskFilter(riskFilter === 'medium' ? 'all' : 'medium')}
                  active={riskFilter === 'medium'}
                />
                <RiskStat
                  label="On track"
                  count={counts.low}
                  level="low"
                  onClick={() => setRiskFilter(riskFilter === 'low' ? 'all' : 'low')}
                  active={riskFilter === 'low'}
                />
              </div>
              {data.goals.length > 0 && (
                <div className="mt-4">
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map(
                      (lvl) => {
                        const c = counts[lvl];
                        if (c === 0) return null;
                        const total = data.goals.length;
                        const pct = (c / total) * 100;
                        return (
                          <div
                            key={lvl}
                            className={cn(
                              'h-full',
                              lvl === 'critical' && 'bg-destructive',
                              lvl === 'high' && 'bg-destructive/70',
                              lvl === 'medium' && 'bg-warning',
                              lvl === 'low' && 'bg-success'
                            )}
                            style={{ width: `${pct}%` }}
                            title={`${lvl}: ${c}`}
                          />
                        );
                      }
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      )}

      {/* Drill-down filter row */}
      {data && data.goals.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" />
            Filter
          </span>
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt.value === 'all'
                ? data.goals.length
                : counts[opt.value as RiskLevel];
            if (opt.value !== 'all' && count === 0) return null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRiskFilter(opt.value)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  riskFilter === opt.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                {opt.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[0.625rem] tabular-nums',
                    riskFilter === opt.value
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Per-goal risk list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">
                {data && data.goals.length > 0
                  ? 'No goals match this filter'
                  : 'No active goals to monitor'}
              </p>
              <p className="text-xs text-muted-foreground">
                {data && data.goals.length > 0
                  ? 'Try a different risk level, or clear the filter.'
                  : 'Create a goal and the copilot will start watching its risk.'}
              </p>
            </div>
            {data && data.goals.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRiskFilter('all')}
              >
                Clear filter
              </Button>
            ) : (
              <Button asChild size="sm" className="gap-1.5">
                <Link href="/goals/new">New goal</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {filteredGoals.map((g) => (
            <li key={g.id} className="stagger-item">
              <Card className="transition-all hover:border-primary/40 hover:shadow-md">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Link
                      href={`/goals/${g.id}`}
                      className="min-w-0 flex-1 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {g.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {g.deadline
                                ? `Due ${formatDeadlineRelative(g.deadline)}`
                                : 'Habit'}
                            </span>
                            <span>
                              {formatMinutes(g.remainingWork)} work ·{' '}
                              {formatMinutes(g.remainingTime)} free time
                            </span>
                          </div>
                        </div>
                        <RiskBadge level={g.riskLevel} showDot className="shrink-0" />
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar
                          value={g.progress}
                          className="flex-1"
                          barClassName={cn(
                            g.riskLevel === 'critical' && 'bg-destructive',
                            g.riskLevel === 'high' && 'bg-destructive/80',
                            g.riskLevel === 'medium' && 'bg-warning',
                            g.riskLevel === 'low' && 'bg-success'
                          )}
                        />
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {g.progress}%
                        </span>
                      </div>
                      {g.latestRisk?.suggestedAction && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                          {g.latestRisk.suggestedAction}
                        </p>
                      )}
                    </Link>
                    {/* Risk trend sparkline */}
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:w-auto">
                      <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
                        Trend
                      </span>
                      <RiskTrendSparkline history={g.riskHistory} />
                    </div>
                  </div>
                  {g.latestRisk && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-[0.6875rem] text-muted-foreground">
                      <ShieldAlert className="h-3 w-3" />
                      <span>
                        Last assessed{' '}
                        {new Date(g.latestRisk.assessedAt).toLocaleString()}
                      </span>
                      {g.latestRisk.reason && (
                        <span className="hidden truncate sm:inline">
                          · {g.latestRisk.reason.split('\n')[0]}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskStat({
  label,
  count,
  level,
  onClick,
  active,
}: {
  label: string;
  count: number;
  level: RiskLevel;
  onClick: () => void;
  active: boolean;
}) {
  const iconMap = {
    critical: AlertTriangle,
    high: AlertTriangle,
    medium: Activity,
    low: ShieldAlert,
  } as const;
  const colorMap = {
    critical: 'text-destructive bg-destructive/10',
    high: 'text-destructive bg-destructive/10',
    medium: 'text-warning-foreground bg-warning/15',
    low: 'text-success bg-success/10',
  } as const;
  const Icon = iconMap[level];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border p-3 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary ring-1 ring-primary'
          : 'border-border hover:border-primary/40',
        count > 0 && level !== 'low' && 'border-l-4',
        count > 0 && level === 'critical' && 'border-l-destructive',
        count > 0 && level === 'high' && 'border-l-destructive/70',
        count > 0 && level === 'medium' && 'border-l-warning'
      )}
      aria-pressed={active}
    >
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md',
          colorMap[level]
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums leading-none">{count}</p>
        <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      </div>
    </button>
  );
}
