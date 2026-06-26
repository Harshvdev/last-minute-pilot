'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Loader2,
  RefreshCw,
  Sparkles,
  CalendarRange,
  ChevronRight,
  Download,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyTimeline } from '@/components/weekly-timeline';
import { usePreferences } from '@/lib/preferences';
import {
  formatBlockRange,
  formatMinutes,
  blockDurationMinutes,
  dayLabel,
} from '@/lib/format';

interface StatsBlock {
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
}

interface StatsResponse {
  now: string;
  todayBlocks: StatsBlock[];
  upcomingBlocks: StatsBlock[];
}

export default function SchedulePage() {
  const qc = useQueryClient();
  const prefs = usePreferences();
  const { data, isLoading, refetch, isFetching } = useQuery<StatsResponse>({
    queryKey: ['schedule'],
    queryFn: async () => {
      const stats = await api<StatsResponse>('/api/stats');
      return stats;
    },
    refetchInterval: 60_000,
  });

  const replanMutation = useMutation({
    mutationFn: () =>
      api<{ goalsProcessed: number }>('/api/schedule/replan', { method: 'POST' }),
    onSuccess: (res) => {
      toast.success(
        `Replanned ${res.goalsProcessed} goal${res.goalsProcessed === 1 ? '' : 's'}.`
      );
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(`Replan failed: ${e.message}`),
  });

  const [exporting, setExporting] = React.useState(false);
  const handleExportIcs = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/schedule/export-ics');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `last-minute-pilot-${new Date().toISOString().slice(0, 10)}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Calendar downloaded — import it into Google Calendar or Apple Calendar.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Group upcoming blocks by day
  const byDay = React.useMemo(() => {
    if (!data) return [];
    const map = new Map<string, StatsBlock[]>();
    for (const b of data.upcomingBlocks) {
      const key = new Date(b.startAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Schedule
          </h1>
          <p className="text-sm text-muted-foreground">
            Your time, fitted to your goals. Re-fit anytime — it only takes a
            second.
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
            variant="outline"
            size="sm"
            onClick={handleExportIcs}
            disabled={exporting}
            className="gap-1.5"
            aria-label="Export schedule as calendar file"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Export .ics</span>
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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <>
        {/* Weekly timeline visualization */}
        {prefs.showWeeklyTimeline &&
          data &&
          (data.todayBlocks.length > 0 || data.upcomingBlocks.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Week at a glance
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <WeeklyTimeline
                blocks={[...data.todayBlocks, ...data.upcomingBlocks]}
              />
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Today */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Today</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!data || data.todayBlocks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium text-foreground">Nothing today</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Replan to fit tasks into your free windows.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {data.todayBlocks.map((b) => (
                    <BlockRow key={b.id} block={b} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">Upcoming</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!data || byDay.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No upcoming blocks
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add availability to a goal and run a replan.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {byDay.slice(0, 7).map(([dayKey, dayBlocks]) => {
                    const dayDate = new Date(dayKey);
                    const totalMin = dayBlocks.reduce(
                      (s, b) => s + blockDurationMinutes(b.startAt, b.endAt),
                      0
                    );
                    return (
                      <div key={dayKey} className="space-y-2">
                        <div className="flex items-baseline justify-between">
                          <h4 className="text-sm font-semibold text-foreground">
                            {dayLabel(dayDate)}
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {dayDate.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            {formatMinutes(totalMin)} planned
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {dayBlocks.map((b) => (
                            <BlockRow key={b.id} block={b} />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </>
      )}
    </div>
  );
}

function BlockRow({ block }: { block: StatsBlock }) {
  const duration = blockDurationMinutes(block.startAt, block.endAt);
  return (
    <li>
      <Link
        href={`/goals/${block.task.goalId}`}
        className={cn(
          'flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          block.status === 'completed' && 'opacity-70',
          block.status === 'missed' && 'border-destructive/30 bg-destructive/5'
        )}
      >
        <div className="flex w-20 shrink-0 flex-col text-xs">
          <span className="font-medium text-foreground">
            {formatBlockRange(block.startAt, block.endAt).split(' – ')[0]}
          </span>
          <span className="text-muted-foreground">{formatMinutes(duration)}</span>
        </div>
        <div className="h-9 w-0.5 rounded-full bg-primary/40" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {block.task.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {block.task.goalTitle}
          </p>
        </div>
        {block.status === 'completed' && (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[0.625rem]">
            Done
          </Badge>
        )}
        {block.status === 'missed' && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[0.625rem]">
            Missed
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
