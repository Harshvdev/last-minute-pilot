'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Flame, ArrowRight, CheckCircle2, Loader2, Lock } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/risk-badge';
import { formatMinutes, formatDeadlineRelative, CATEGORIES } from '@/lib/format';

interface Priority {
  taskId: string;
  title: string;
  estimatedMinutes: number;
  isBlocked: boolean;
  goalId: string;
  goalTitle: string;
  goalCategory: string | null;
  goalPriority: number;
  goalDeadline: string | null;
  goalRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  goalProgress: number;
  goalDoneTasks: number;
  goalTotalTasks: number;
}

interface PrioritiesResponse {
  now: string;
  priorities: Priority[];
  totalCandidates: number;
}

const RANK_BADGE = [
  'bg-primary text-primary-foreground',
  'bg-primary/80 text-primary-foreground',
  'bg-primary/60 text-primary-foreground',
];

export function TopPrioritiesCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PrioritiesResponse>({
    queryKey: ['priorities'],
    queryFn: () => api('/api/priorities'),
    refetchInterval: 60_000,
  });

  const completeMutation = useMutation({
    mutationFn: ({ goalId, taskId }: { goalId: string; taskId: string }) =>
      api(`/api/goals/${goalId}/tasks/${taskId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          completed: true,
          note: 'Marked from Top 3 priorities',
        }),
      }),
    onSuccess: () => {
      toast.success('Task marked complete');
      qc.invalidateQueries({ queryKey: ['priorities'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['streaks'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-warning/15 text-warning">
            <Flame className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">
            Today&apos;s top 3
          </CardTitle>
        </div>
        <Badge variant="outline" className="text-[0.625rem] font-medium text-muted-foreground">
          {data ? `${data.priorities.length} of ${data.totalCandidates}` : '…'}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.priorities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              No priorities queued
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a goal with tasks and your top 3 will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {data.priorities.map((p, i) => {
              const categoryLabel = p.goalCategory
                ? CATEGORIES.find((c) => c.value === p.goalCategory)?.label ?? p.goalCategory
                : null;
              return (
                <li
                  key={p.taskId}
                  className="stagger-item group relative overflow-hidden rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start gap-3">
                    {/* Rank badge */}
                    <div
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums',
                        RANK_BADGE[i] ?? RANK_BADGE[2]
                      )}
                      aria-label={`Priority ${i + 1}`}
                    >
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/goals/${p.goalId}`}
                          className="min-w-0 flex-1 text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:text-primary"
                        >
                          <span className="line-clamp-1">{p.title}</span>
                        </Link>
                        {p.isBlocked && (
                          <Badge
                            variant="outline"
                            className="shrink-0 gap-1 border-muted-foreground/30 bg-muted/50 text-muted-foreground text-[0.625rem]"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            Blocked
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-muted-foreground">
                        <Link
                          href={`/goals/${p.goalId}`}
                          className="truncate hover:text-foreground"
                        >
                          {p.goalTitle}
                        </Link>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-0.5">
                          {formatMinutes(p.estimatedMinutes)}
                        </span>
                        {p.goalDeadline && (
                          <>
                            <span aria-hidden>·</span>
                            <span
                              className={cn(
                                'font-medium',
                                deadlineUrgencyClass(p.goalDeadline)
                              )}
                            >
                              {formatDeadlineRelative(p.goalDeadline)}
                            </span>
                          </>
                        )}
                        {categoryLabel && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{categoryLabel}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <RiskBadge level={p.goalRiskLevel} showDot={false} />
                          <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                            {p.goalDoneTasks}/{p.goalTotalTasks} done
                          </span>
                        </div>
                        {!p.isBlocked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-[0.6875rem] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-success"
                            onClick={() =>
                              completeMutation.mutate({
                                goalId: p.goalId,
                                taskId: p.taskId,
                              })
                            }
                            disabled={completeMutation.isPending}
                            aria-label="Mark complete"
                          >
                            {completeMutation.isPending &&
                            completeMutation.variables?.taskId === p.taskId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )}
                            Done
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-end">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
          >
            <Link href="/focus">
              Enter focus mode
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function deadlineUrgencyClass(deadlineIso: string): string {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 1) return 'text-destructive';
  if (days <= 3) return 'text-warning-foreground';
  return 'text-muted-foreground';
}
