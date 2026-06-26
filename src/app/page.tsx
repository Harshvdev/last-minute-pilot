'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plane,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Target,
  Sparkles,
  CalendarClock,
  ArrowRight,
  Loader2,
  Crosshair,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/risk-badge';
import { ProgressBar } from '@/components/progress-bar';
import { PaceProjectionCard } from '@/components/pace-projection-card';
import { StreakCard } from '@/components/streak-card';
import { QuickAddTask } from '@/components/quick-add-task';
import { DailyReviewCard } from '@/components/daily-review-card';
import { TopPrioritiesCard } from '@/components/top-priorities-card';
import { GoalHealthScore } from '@/components/goal-health-score';
import { WeeklySummaryCard } from '@/components/weekly-summary-card';
import { useClientDate } from '@/hooks/use-client-date';
import { usePreferences } from '@/lib/preferences';
import {
  formatMinutes,
  formatDeadlineRelative,
  formatBlockRange,
  blockDurationMinutes,
} from '@/lib/format';
import type { RiskLevel } from '@/lib/types';

interface StatsResponse {
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
    latestRisk: { reason: string | null; suggestedAction: string | null } | null;
  }>;
  todayBlocks: Array<{
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
  }>;
  upcomingBlocks: Array<{
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
  }>;
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const prefs = usePreferences();
  const now = useClientDate();
  const { data, isLoading, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => api('/api/stats'),
    refetchInterval: 60_000,
  });

  const seedMutation = useMutation({
    mutationFn: () => api<{ ok: boolean; seeded: boolean }>('/api/seed', { method: 'POST' }),
    onSuccess: (res) => {
      if (res.seeded) {
        toast.success('Demo goals added — start exploring.');
        qc.invalidateQueries({ queryKey: ['stats'] });
      } else {
        toast.info('You already have goals — no demo added.');
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replanMutation = useMutation({
    mutationFn: () =>
      api<{ goalsProcessed: number }>('/api/schedule/replan', { method: 'POST' }),
    onSuccess: (res) => {
      toast.success(`Replanned ${res.goalsProcessed} goal${res.goalsProcessed === 1 ? '' : 's'}.`);
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(`Replan failed: ${e.message}`),
  });

  const isEmpty = !isLoading && data && data.summary.totalActiveGoals === 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Hero — answers "What should I work on right now?" */}
      <section aria-labelledby="hero-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {now
                ? now.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })
                : '\u00A0'}
            </p>
            <h2
              id="hero-heading"
              className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              {now ? `${greeting(now)}.` : 'Hello.'}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground text-pretty">
              Your copilot monitors every active goal and re-fits your schedule
              when you fall behind. Here is the truth about your week.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <QuickAddTask />
            <Button asChild variant="outline" size="sm" className="gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary">
              <Link href="/focus">
                <Crosshair className="h-4 w-4" />
                <span className="hidden sm:inline">Focus</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => replanMutation.mutate()}
              disabled={replanMutation.isPending}
              className="gap-2"
            >
              {replanMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Replan now</span>
            </Button>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section
        aria-label="Overview"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        <StatCard
          label="Active goals"
          value={data?.summary.totalActiveGoals}
          icon={Target}
          loading={isLoading}
          href="/goals"
        />
        <StatCard
          label="Tasks done"
          value={
            data
              ? `${data.summary.doneTasks}`
              : undefined
          }
          progressLabel={data ? `of ${data.summary.totalTasks}` : undefined}
          progress={
            data && data.summary.totalTasks > 0
              ? (data.summary.doneTasks / data.summary.totalTasks) * 100
              : 0
          }
          icon={CheckCircle2}
          loading={isLoading}
          accent="success"
        />
        <StatCard
          label="At-risk goals"
          value={data?.summary.criticalGoals}
          icon={AlertTriangle}
          loading={isLoading}
          accent={data && data.summary.criticalGoals > 0 ? 'destructive' : 'muted'}
          progress={
            data && data.summary.totalActiveGoals > 0
              ? (data.summary.criticalGoals / data.summary.totalActiveGoals) * 100
              : 0
          }
        />
        <StatCard
          label="Today's blocks"
          value={data?.summary.todayBlocksCount}
          icon={CalendarClock}
          loading={isLoading}
          href="/schedule"
        />
      </section>

      {isEmpty ? (
        <EmptyState onSeed={() => seedMutation.mutate()} seeding={seedMutation.isPending} />
      ) : (
        <>
        {/* Daily review — shows in evening or when goals are at risk */}
        <DailyReviewCard />

        {/* Weekly summary + Pace projection + Momentum streak — 3-col on desktop */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <WeeklySummaryCard />
          {prefs.showPaceProjection && <PaceProjectionCard />}
          <StreakCard />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Today's focus — answers "What should I work on right now?" */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Today&apos;s focus
                </CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                <Link href="/schedule">
                  Schedule
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : data && data.todayBlocks.length > 0 ? (
                <ul className="space-y-2">
                  {data.todayBlocks.slice(0, 6).map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/goals/${b.task.goalId}`}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex w-20 shrink-0 flex-col text-xs">
                          <span className="font-medium text-foreground">
                            {formatBlockRange(b.startAt, b.endAt).split(' – ')[0]}
                          </span>
                          <span className="text-muted-foreground">
                            {formatMinutes(blockDurationMinutes(b.startAt, b.endAt))}
                          </span>
                        </div>
                        <div className="h-9 w-0.5 rounded-full bg-primary/40" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {b.task.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {b.task.goalTitle}
                          </p>
                        </div>
                        {b.status === 'completed' && (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            Done
                          </Badge>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium text-foreground">Nothing scheduled today</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add availability to a goal, then run &ldquo;Replan now&rdquo;.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 3 priorities — answers "What are my most important tasks?" */}
          <TopPrioritiesCard />

          {/* At-a-glance risk — answers "Am I on track?" */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Risk snapshot</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              ) : data && data.goals.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.goals
                    .slice()
                    .sort((a, b) => {
                      const order: Record<RiskLevel, number> = {
                        critical: 0,
                        high: 1,
                        medium: 2,
                        low: 3,
                      };
                      return order[a.riskLevel] - order[b.riskLevel];
                    })
                    .slice(0, 6)
                    .map((g) => (
                      <li key={g.id}>
                        <Link
                          href={`/goals/${g.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {g.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatMinutes(g.remainingMinutes)} left ·{' '}
                              {g.deadline
                                ? formatDeadlineRelative(g.deadline)
                                : 'no deadline'}
                            </p>
                          </div>
                          <RiskBadge level={g.riskLevel} showDot />
                        </Link>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No active goals.</p>
              )}
            </CardContent>
          </Card>
        </div>
        </>
      )}

      {/* Active goals grid — answers "What am I trying to achieve?" */}
      {!isEmpty && (
        <section aria-labelledby="goals-heading">
          <div className="mb-3 flex items-center justify-between">
            <h3
              id="goals-heading"
              className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Active goals
            </h3>
            <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <Link href="/goals">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data?.goals.slice(0, 6).map((g, i) => (
                <div
                  key={g.id}
                  className="stagger-item"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <GoalCard goal={g} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  accent = 'primary',
  href,
  progress,
  progressLabel,
}: {
  label: string;
  value?: string | number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  accent?: 'primary' | 'success' | 'destructive' | 'muted';
  href?: string;
  progress?: number; // 0-100, optional
  progressLabel?: string; // e.g. "of 35"
}) {
  const accentMap = {
    primary: 'text-primary',
    success: 'text-success',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
  } as const;
  const barColorMap = {
    primary: 'bg-primary',
    success: 'bg-success',
    destructive: 'bg-destructive',
    muted: 'bg-muted-foreground',
  } as const;

  const inner = (
    <Card
      className={cn(
        'transition-colors',
        href && 'hover:bg-accent/40 cursor-pointer'
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={cn('h-4 w-4', accentMap[accent])} />
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <span className="text-2xl font-semibold tracking-tight tabular-nums">
              {value ?? 0}
            </span>
          )}
          {progressLabel && !loading && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {progressLabel}
            </span>
          )}
        </div>
        {typeof progress === 'number' && !loading && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', barColorMap[accent])}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

function GoalCard({
  goal,
}: {
  goal: StatsResponse['goals'][number];
}) {
  const categoryAccent = CATEGORY_ACCENTS[goal.category ?? 'other'] ?? CATEGORY_ACCENTS.other;
  return (
    <Link href={`/goals/${goal.id}`} className="group block focus-visible:outline-none">
      <Card className="relative h-full overflow-hidden transition-all duration-200 hover:border-primary/40 hover:shadow-md focus-within:border-primary/40 focus-within:shadow-md">
        {/* Category accent strip */}
        <div
          className={cn('absolute inset-x-0 top-0 h-0.5', categoryAccent.bar)}
          aria-hidden
        />
        <CardContent className="flex h-full flex-col gap-3 p-4 pt-5 sm:p-5 sm:pt-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                {goal.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {goal.deadline
                  ? `Due ${formatDeadlineRelative(goal.deadline)}`
                  : 'Habit · no deadline'}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <RiskBadge level={goal.riskLevel} showDot />
              <GoalHealthScore
                progress={goal.progress}
                riskLevel={goal.riskLevel}
                deadline={goal.deadline}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">
                  {goal.doneTasks}
                </span>
                <span className="text-muted-foreground">
                  /{goal.totalTasks} tasks
                </span>
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {goal.progress}%
              </span>
            </div>
            <ProgressBar value={goal.progress} />
          </div>
          <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatMinutes(goal.remainingMinutes)} left
            </span>
            {goal.latestRisk?.suggestedAction && (
              <span className="inline-flex items-center gap-1 truncate">
                <Sparkles className="h-3 w-3 text-primary" />
                <span className="truncate">Copilot action ready</span>
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

const CATEGORY_ACCENTS: Record<string, { bar: string }> = {
  work: { bar: 'bg-primary' },
  study: { bar: 'bg-chart-3' },
  personal: { bar: 'bg-chart-2' },
  health: { bar: 'bg-success' },
  project: { bar: 'bg-chart-4' },
  other: { bar: 'bg-muted-foreground/40' },
};

function EmptyState({
  onSeed,
  seeding,
}: {
  onSeed: () => void;
  seeding: boolean;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Plane className="h-7 w-7 -rotate-45" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold tracking-tight">
            No goals yet
          </h3>
          <p className="max-w-md text-sm text-muted-foreground text-pretty">
            Add your first goal — describe it in plain English. Your copilot
            will break it into tasks, fit them into your free time, and watch
            the deadline for you.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="gap-2">
            <Link href="/goals/new">
              <Plus className="h-4 w-4" />
              Create a goal
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={onSeed}
            disabled={seeding}
            className="gap-2"
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Load demo goals
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
