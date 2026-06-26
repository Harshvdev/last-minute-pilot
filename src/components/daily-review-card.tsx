'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Sunset,
  CheckCircle2,
  Sunrise,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RiskBadge } from '@/components/risk-badge';
import { useClientDate } from '@/hooks/use-client-date';
import { formatMinutes, formatBlockRange } from '@/lib/format';
import type { RiskLevel } from '@/lib/types';

interface DailyReviewResponse {
  now: string;
  date: string;
  today: {
    tasksCompleted: number;
    minutesInvested: number;
    completedTaskTitles: string[];
    missedBlocks: number;
  };
  tomorrow: {
    blocksCount: number;
    minutesPlanned: number;
    firstBlock: { startAt: string; title: string; goalTitle: string } | null;
    blocks: { id: string; startAt: string; endAt: string; title: string; goalTitle: string }[];
  };
  atRiskGoals: { id: string; title: string; riskLevel: RiskLevel; suggestedAction: string | null }[];
}

// Shows only in the evening (after 5pm) OR when there are at-risk goals.
// End-of-day summary: today's wins, tomorrow's plan, and what needs attention.
export function DailyReviewCard() {
  const { data, isLoading } = useQuery<DailyReviewResponse>({
    queryKey: ['daily-review'],
    queryFn: () => api('/api/daily-review'),
    refetchInterval: 120_000,
  });

  const now = useClientDate();
  const isEvening = now ? now.getHours() >= 17 : false;

  // Don't render until the client has mounted and we know the hour.
  // This avoids hydration mismatches where the server hour differs from
  // the client hour (e.g. server is in UTC, client is in IST).
  if (!now) return null;

  // Only render if it's evening OR there are at-risk goals
  if (!isLoading && !isEvening && (data?.atRiskGoals.length ?? 0) === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasWins = data.today.tasksCompleted > 0;
  const hasTomorrow = data.tomorrow.blocksCount > 0;
  const hasRisk = data.atRiskGoals.length > 0;

  return (
    <Card className={cn('border-l-4', isEvening ? 'border-l-warning' : 'border-l-destructive')}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {isEvening ? (
            <Sunset className="h-4 w-4 text-warning" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
          <CardTitle className="text-base font-semibold">
            {isEvening ? 'Daily review' : 'Needs attention'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Today's wins */}
        {isEvening && (
          <div className="space-y-1.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Today
            </p>
            {hasWins ? (
              <div className="space-y-1">
                <p className="text-sm text-foreground">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-success" />
                  <span className="font-semibold tabular-nums">
                    {data.today.tasksCompleted}
                  </span>{' '}
                  task{data.today.tasksCompleted === 1 ? '' : 's'} done ·{' '}
                  {formatMinutes(data.today.minutesInvested)} invested
                </p>
                {data.today.completedTaskTitles.length > 0 && (
                  <ul className="ml-5 list-disc space-y-0.5 text-xs text-muted-foreground">
                    {data.today.completedTaskTitles.map((t, i) => (
                      <li key={i} className="truncate">{t}</li>
                    ))}
                  </ul>
                )}
                {data.today.missedBlocks > 0 && (
                  <p className="text-xs text-warning">
                    {data.today.missedBlocks} block{data.today.missedBlocks === 1 ? '' : 's'} missed today.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No tasks completed yet today.{' '}
                {data.today.missedBlocks > 0 && (
                  <span className="text-warning">
                    {data.today.missedBlocks} block{data.today.missedBlocks === 1 ? '' : 's'} missed.
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* At-risk goals */}
        {hasRisk && (
          <div className="space-y-1.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              At risk
            </p>
            <ul className="space-y-1">
              {data.atRiskGoals.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/goals/${g.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 transition-colors hover:bg-accent/50"
                  >
                    <RiskBadge level={g.riskLevel} showDot className="shrink-0" />
                    <span className="truncate text-xs font-medium text-foreground">
                      {g.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tomorrow's plan */}
        {isEvening && (
          <div className="space-y-1.5">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Tomorrow
            </p>
            {hasTomorrow ? (
              <div className="space-y-1.5">
                <p className="text-sm text-foreground">
                  <Sunrise className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold tabular-nums">
                    {data.tomorrow.blocksCount}
                  </span>{' '}
                  block{data.tomorrow.blocksCount === 1 ? '' : 's'} ·{' '}
                  {formatMinutes(data.tomorrow.minutesPlanned)} planned
                </p>
                {data.tomorrow.firstBlock && (
                  <p className="text-xs text-muted-foreground">
                    Starts at{' '}
                    <span className="font-medium text-foreground">
                      {formatBlockRange(data.tomorrow.firstBlock.startAt, data.tomorrow.firstBlock.startAt).split(' – ')[0]}
                    </span>{' '}
                    with {data.tomorrow.firstBlock.title}
                  </p>
                )}
                <Link
                  href="/schedule"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <CalendarDays className="h-3 w-3" />
                  View full schedule
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-2.5">
                <p className="text-xs text-muted-foreground">
                  Nothing scheduled yet. Run a replan to fit tasks into your free time.
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
