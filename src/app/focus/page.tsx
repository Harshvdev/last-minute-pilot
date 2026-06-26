'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Target,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/risk-badge';
import { FocusTimer } from '@/components/focus-timer';
import { ConfettiBurst } from '@/components/confetti-burst';
import {
  formatMinutes,
  formatBlockRange,
  blockDurationMinutes,
} from '@/lib/format';
import type { RiskLevel, TaskStatus } from '@/lib/types';

interface StatsResponse {
  now: string;
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
  goals: Array<{
    id: string;
    title: string;
    deadline: string | null;
    riskLevel: RiskLevel;
    remainingWork: number;
    remainingTime: number;
    latestRisk: { suggestedAction: string | null } | null;
  }>;
}

export default function FocusPage() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => api('/api/stats'),
    refetchInterval: 30_000,
  });

  // Confetti trigger — increment to fire a burst.
  const [confettiTrigger, setConfettiTrigger] = React.useState(0);

  // The "focus" is: the next upcoming or in-progress block today.
  // If none today, pick the highest-risk goal's most urgent task.
  const focus = React.useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = data.todayBlocks.filter(
      (b) => new Date(b.endAt) > now && b.status !== 'completed'
    );
    if (today.length > 0) {
      return { type: 'block' as const, block: today[0] };
    }
    const atRisk = data.goals
      .filter((g) => g.remainingWork > 0)
      .sort((a, b) => {
        const order: Record<RiskLevel, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return order[a.riskLevel] - order[b.riskLevel];
      });
    if (atRisk.length > 0) {
      return { type: 'goal' as const, goal: atRisk[0] };
    }
    return null;
  }, [data]);

  const completeMutation = useMutation({
    mutationFn: (taskId: string) =>
      api(`/api/goals/${focus?.block.task.goalId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'done' as TaskStatus }),
      }),
    onSuccess: () => {
      toast.success('Task complete. Nice work.');
      setConfettiTrigger((n) => n + 1);
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['streaks'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Keyboard shortcut: "d" to mark complete, "n" for next, "Escape" to exit.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        if (focus?.type === 'block' && !completeMutation.isPending) {
          e.preventDefault();
          completeMutation.mutate(focus.block.task.id);
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        refetch();
      } else if (e.key === 'Escape') {
        window.location.href = '/';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focus, completeMutation, refetch]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center space-y-6">
      <ConfettiBurst trigger={confettiTrigger} message="Done!" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Exit focus
            <kbd className="ml-1 hidden select-none rounded border border-border bg-muted px-1 py-0.5 text-[0.625rem] font-medium text-muted-foreground sm:inline">
              Esc
            </kbd>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="gap-1 text-muted-foreground"
        >
          <Loader2 className="hidden" />
          Next
          <ChevronRight className="h-4 w-4" />
          <kbd className="ml-1 hidden select-none rounded border border-border bg-muted px-1 py-0.5 text-[0.625rem] font-medium text-muted-foreground sm:inline">
            N
          </kbd>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : !focus ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Nothing to focus on</p>
              <p className="text-xs text-muted-foreground">
                You&apos;re all caught up. No scheduled blocks and no at-risk
                goals. Enjoy the breather.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/goals">Browse goals</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* The one thing to focus on */}
          <div className="space-y-3">
            <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {focus.type === 'block'
                ? 'Scheduled now'
                : 'Highest-priority goal'}
            </p>

            {focus.type === 'block' ? (
              <FocusBlock
                block={focus.block}
                onComplete={() =>
                  completeMutation.mutate(focus.block.task.id)
                }
                completing={completeMutation.isPending}
              />
            ) : (
              <FocusGoal goal={focus.goal} />
            )}
          </div>

          {/* Upcoming queue */}
          {data && focus.type === 'block' && (
            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Up next
              </p>
              <ul className="space-y-1.5">
                {data.todayBlocks
                  .filter(
                    (b) =>
                      b.id !== focus.block.id &&
                      new Date(b.endAt) > new Date() &&
                      b.status !== 'completed'
                  )
                  .slice(0, 3)
                  .map((b) => (
                    <li key={b.id}>
                      <Link
                        href={`/goals/${b.task.goalId}`}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card p-2.5 text-xs transition-colors hover:bg-accent/50"
                      >
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="shrink-0 font-medium tabular-nums text-muted-foreground">
                          {formatBlockRange(b.startAt, b.endAt).split(' – ')[0]}
                        </span>
                        <span className="truncate text-foreground">
                          {b.task.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                {data.todayBlocks.filter(
                  (b) =>
                    b.id !== focus.block.id &&
                    new Date(b.endAt) > new Date() &&
                    b.status !== 'completed'
                ).length === 0 && (
                  <li className="rounded-lg border border-dashed border-border p-2.5 text-center text-xs text-muted-foreground">
                    Nothing else scheduled today.
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FocusBlock({
  block,
  onComplete,
  completing,
}: {
  block: StatsResponse['todayBlocks'][number];
  onComplete: () => void;
  completing: boolean;
}) {
  const duration = blockDurationMinutes(block.startAt, block.endAt);
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);
  const now = new Date();
  const isLive = now >= start && now < end;
  const isUpcoming = now < start;
  const minsToStart = Math.round((start.getTime() - now.getTime()) / 60000);

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="h-1 bg-primary" />
      <CardContent className="space-y-5 p-6 sm:p-8">
        {/* Status badge */}
        <div className="flex items-center justify-center">
          {isLive ? (
            <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5">
              <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-primary" />
              In progress
            </Badge>
          ) : isUpcoming ? (
            <Badge variant="outline" className="gap-1.5">
              <Clock className="h-3 w-3" />
              {minsToStart <= 0
                ? 'Starting now'
                : `Starts in ${minsToStart}m`}
            </Badge>
          ) : (
            <Badge variant="outline">Scheduled</Badge>
          )}
        </div>

        {/* Task title */}
        <div className="space-y-1 text-center">
          <p className="text-xs text-muted-foreground">{block.task.goalTitle}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {block.task.title}
          </h1>
        </div>

        {/* Time + duration */}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatBlockRange(block.startAt, block.endAt)}
          </span>
          <span>·</span>
          <span className="tabular-nums">{formatMinutes(duration)}</span>
        </div>

        {/* Focus timer with progress ring */}
        <FocusTimer
          totalMinutes={duration}
          storageKey={`focus-timer:${block.task.id}`}
        />

        {/* Big complete button */}
        <Button
          onClick={onComplete}
          disabled={completing}
          size="lg"
          className="w-full gap-2 py-6 text-base"
        >
          {completing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          Mark complete
          <kbd className="ml-1 hidden select-none rounded border border-primary-foreground/30 bg-primary-foreground/10 px-1 py-0.5 text-[0.625rem] font-medium sm:inline">
            D
          </kbd>
        </Button>

        {/* Open goal link */}
        <div className="text-center">
          <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <Link href={`/goals/${block.task.goalId}`}>
              Open goal
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FocusGoal({
  goal,
}: {
  goal: StatsResponse['goals'][number];
}) {
  return (
    <Card className="overflow-hidden border-warning/30">
      <div className="h-1 bg-warning" />
      <CardContent className="space-y-4 p-6 sm:p-8">
        <div className="flex items-center justify-center">
          <RiskBadge level={goal.riskLevel} showDot />
        </div>
        <div className="space-y-1 text-center">
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            Needs your attention
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {goal.title}
          </h1>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-center text-sm">
          <p className="font-medium text-foreground">
            {formatMinutes(goal.remainingWork)} of work left
          </p>
          <p className="text-xs text-muted-foreground">
            vs {formatMinutes(goal.remainingTime)} of free time before deadline
          </p>
        </div>
        {goal.latestRisk?.suggestedAction && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center text-sm">
            <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
            <span className="text-foreground">{goal.latestRisk.suggestedAction}</span>
          </div>
        )}
        <Button asChild size="lg" className="w-full gap-2 py-6 text-base">
          <Link href={`/goals/${goal.id}`}>
            <Target className="h-5 w-5" />
            Open this goal
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
