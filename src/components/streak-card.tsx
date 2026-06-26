'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flame, Trophy, Calendar, CheckCircle2 } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StreaksResponse {
  now: string;
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  totalCompletions: number;
  completionsThisWeek: number;
  activeToday: boolean;
  heatmap: { date: string; count: number }[];
}

export function StreakCard() {
  const { data, isLoading } = useQuery<StreaksResponse>({
    queryKey: ['streaks'],
    queryFn: () => api('/api/streaks'),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const streakTone =
    data.currentStreak >= 7
      ? 'text-destructive'
      : data.currentStreak >= 3
        ? 'text-warning'
        : 'text-muted-foreground';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className={cn('h-4 w-4', streakTone)} />
            <CardTitle className="text-base font-semibold">
              Momentum
            </CardTitle>
          </div>
          {data.activeToday ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[0.625rem] font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Active today
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
              Log progress to keep it
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Big streak number */}
        <div className="flex items-end gap-4">
          <div>
            <p className={cn('text-4xl font-bold tabular-nums leading-none', streakTone)}>
              {data.currentStreak}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              day{data.currentStreak === 1 ? '' : 's'} streak
            </p>
          </div>
          <div className="flex-1 space-y-1.5">
            <MiniStat
              icon={Trophy}
              label="Best"
              value={`${data.longestStreak}d`}
            />
            <MiniStat
              icon={CheckCircle2}
              label="This week"
              value={`${data.completionsThisWeek}`}
            />
            <MiniStat
              icon={Calendar}
              label="Active days"
              value={`${data.totalActiveDays}`}
            />
          </div>
        </div>

        {/* 14-day heatmap */}
        <div>
          <p className="mb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            Last 14 days
          </p>
          <div className="flex items-end gap-1">
            {data.heatmap.map((day) => {
              const d = new Date(day.date + 'T00:00:00');
              const isToday =
                d.toISOString().slice(0, 10) ===
                new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${day.count > 0 ? ' · active' : ''}`}
                >
                  <div
                    className={cn(
                      'h-8 w-full rounded-md transition-colors',
                      day.count > 0
                        ? 'bg-primary'
                        : 'bg-muted',
                      isToday && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
                    )}
                  />
                  <span className="text-[0.5rem] tabular-nums text-muted-foreground">
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {data.currentStreak === 0 && !data.activeToday && (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-center text-xs text-muted-foreground">
            <Flame className="mr-1 inline h-3 w-3 text-warning" />
            Log any progress today to start a new streak.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
