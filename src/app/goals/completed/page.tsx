'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Trophy,
  Target,
  Clock,
  Calendar,
  CheckCircle2,
  TrendingUp,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressBar } from '@/components/progress-bar';
import {
  formatMinutes,
  formatDeadline,
  CATEGORIES,
} from '@/lib/format';

interface GoalListItem {
  id: string;
  title: string;
  goalType: string;
  deadline: string | null;
  status: string;
  rawInput: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  doneTasks: number;
  totalTasks: number;
  remainingMinutes: number;
  latestRisk: {
    riskLevel: string;
    reason: string | null;
    suggestedAction: string | null;
  } | null;
}

export default function CompletedGoalsPage() {
  const { data, isLoading } = useQuery<{ goals: GoalListItem[] }>({
    queryKey: ['goals'],
    queryFn: () => api('/api/goals'),
  });

  const completed = React.useMemo(
    () =>
      (data?.goals ?? [])
        .filter((g) => g.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [data]
  );

  const abandoned = React.useMemo(
    () =>
      (data?.goals ?? [])
        .filter((g) => g.status === 'abandoned')
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [data]
  );

  // Stats
  const stats = React.useMemo(() => {
    const totalCompleted = completed.length;
    const totalTasksDone = completed.reduce((s, g) => s + g.doneTasks, 0);
    const totalMinutes = completed.reduce(
      (s, g) => s + (g.totalTasks > 0 ? g.doneTasks * (g.remainingMinutes / Math.max(1, g.totalTasks - g.doneTasks) + 30) : 0),
      0
    );
    // Habits completed (rough — count habit goals)
    const habitsCompleted = completed.filter(
      (g) => g.goalType === 'habit'
    ).length;
    return {
      totalCompleted,
      totalTasksDone,
      totalMinutes: Math.round(totalMinutes),
      habitsCompleted,
    };
  }, [completed]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <Link href="/goals" aria-label="Back to goals">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Trophy className="h-6 w-6 text-warning" />
            Wins
          </h1>
          <p className="text-sm text-muted-foreground">
            Goals you&apos;ve completed. Celebrate the progress.
          </p>
        </div>
      </div>

      {/* Stats */}
      {completed.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatTile
            label="Goals completed"
            value={stats.totalCompleted}
            icon={Trophy}
            accent="warning"
          />
          <StatTile
            label="Tasks done"
            value={stats.totalTasksDone}
            icon={CheckCircle2}
            accent="success"
          />
          <StatTile
            label="Time invested"
            value={formatMinutes(stats.totalMinutes)}
            icon={Clock}
            accent="primary"
          />
          <StatTile
            label="Habits built"
            value={stats.habitsCompleted}
            icon={TrendingUp}
            accent="primary"
          />
        </div>
      )}

      {/* Completed goals */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Completed ({completed.length})
        </h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : completed.length === 0 ? (
          <Card className="border-dashed overflow-hidden">
            <div className="h-1 bg-warning" aria-hidden />
            <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/15 text-warning animate-pop-in">
                  <Trophy className="h-8 w-8" />
                </div>
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-warning text-[0.625rem] font-bold text-warning-foreground">
                  !
                </span>
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-semibold">Your first win awaits</p>
                <p className="max-w-sm text-sm text-muted-foreground text-pretty">
                  Every completed goal lands here as a trophy. Finish your first
                  one and start building your streak.
                </p>
              </div>
              {/* Achievement preview badges */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Badge variant="outline" className="gap-1 border-warning/30 bg-warning/5 text-warning-foreground opacity-60">
                  <Trophy className="h-3 w-3" />
                  First Win
                </Badge>
                <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary opacity-60">
                  <TrendingUp className="h-3 w-3" />
                  3-Streak
                </Badge>
                <Badge variant="outline" className="gap-1 border-success/30 bg-success/5 text-success opacity-60">
                  <CheckCircle2 className="h-3 w-3" />
                  10 Tasks
                </Badge>
              </div>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <Button asChild size="sm" className="gap-1.5">
                  <Link href="/goals/new">
                    <Target className="h-4 w-4" />
                    Start a goal
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link href="/goals">
                    View active goals
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {completed.map((g, i) => (
              <li
                key={g.id}
                className="stagger-item"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Card className="relative overflow-hidden transition-all hover:border-success/40 hover:shadow-sm">
                  <div className="absolute inset-y-0 left-0 w-1 bg-success" aria-hidden />
                  <CardContent className="flex items-center gap-3 p-4 pl-5 sm:p-5 sm:pl-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <Link
                      href={`/goals/${g.id}`}
                      className="min-w-0 flex-1 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-foreground">
                            {g.title}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {g.category && (
                              <span className="capitalize">
                                {CATEGORIES.find((c) => c.value === g.category)?.label ?? g.category}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Completed {formatDeadline(g.updatedAt)}
                            </span>
                            <span>
                              <span className="font-semibold text-foreground tabular-nums">
                                {g.doneTasks}
                              </span>
                              <span className="text-muted-foreground">/{g.totalTasks} tasks</span>
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 shrink-0">
                          100%
                        </Badge>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3">
                        <ProgressBar value={100} className="flex-1" barClassName="bg-success" />
                      </div>
                    </Link>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Link href={`/goals/${g.id}/edit`}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Reactivate</span>
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Archived goals */}
      {abandoned.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Archived ({abandoned.length})
          </h2>
          <ul className="space-y-2">
            {abandoned.map((g) => (
              <li key={g.id}>
                <Card className="opacity-70 transition-opacity hover:opacity-100">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Target className="h-4 w-4" />
                    </div>
                    <Link
                      href={`/goals/${g.id}`}
                      className="min-w-0 flex-1 focus-visible:outline-none"
                    >
                      <p className="truncate text-sm font-medium text-foreground">
                        {g.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Archived {formatDeadline(g.updatedAt)}
                      </p>
                    </Link>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Link href={`/goals/${g.id}/edit`}>Reactivate</Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatTile({
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
