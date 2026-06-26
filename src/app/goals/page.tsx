'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Target,
  Loader2,
  Search,
  Filter,
  Sparkles,
  Trash2,
  Clock,
  Calendar,
  Trophy,
  ArrowUpDown,
  CheckSquare,
  Archive,
  X,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RiskBadge } from '@/components/risk-badge';
import { ProgressBar } from '@/components/progress-bar';
import { PriorityStar } from '@/components/priority-star';
import { GoalHealthScore } from '@/components/goal-health-score';
import {
  formatMinutes,
  formatDeadlineRelative,
  CATEGORIES,
} from '@/lib/format';
import type { RiskLevel } from '@/lib/types';

interface GoalListItem {
  id: string;
  title: string;
  goalType: string;
  deadline: string | null;
  status: string;
  rawInput: string | null;
  category: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
  progress: number;
  doneTasks: number;
  totalTasks: number;
  remainingMinutes: number;
  latestRisk: {
    riskLevel: RiskLevel;
    reason: string | null;
    suggestedAction: string | null;
  } | null;
}

export default function GoalsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'active' | 'completed' | 'all'>('active');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<'priority' | 'updated' | 'deadline' | 'progress'>('priority');
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ goals: GoalListItem[] }>({
    queryKey: ['goals'],
    queryFn: () => api('/api/goals'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Goal deleted');
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          api(`/api/goals/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'archived' }),
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} goal(s) failed to archive`);
    },
    onSuccess: (_data, ids) => {
      toast.success(`Archived ${ids.length} goal${ids.length === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api(`/api/goals/${id}`, { method: 'DELETE' }))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`${failed} goal(s) failed to delete`);
    },
    onSuccess: (_data, ids) => {
      toast.success(`Deleted ${ids.length} goal${ids.length === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      setSelectionMode(false);
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const goals = React.useMemo(() => {
    if (!data) return [];
    const filtered = data.goals.filter((g) => {
      if (statusFilter !== 'all' && g.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !g.title.toLowerCase().includes(q) &&
          !(g.rawInput ?? '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
    // Sort
    return filtered.sort((a, b) => {
      if (sortBy === 'priority') {
        return (b.priority ?? 0) - (a.priority ?? 0);
      }
      if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === 'deadline') {
        // Goals with no deadline sink to the bottom
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'progress') {
        return b.progress - a.progress;
      }
      return 0;
    });
  }, [data, statusFilter, categoryFilter, search, sortBy]);

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === goals.length) return new Set();
      return new Set(goals.map((g) => g.id));
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Goals
          </h1>
          <p className="text-sm text-muted-foreground">
            Every goal is monitored for risk and re-fit to your free time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/goals/completed">
              <Trophy className="h-4 w-4 text-warning" />
              <span className="hidden sm:inline">Wins</span>
            </Link>
          </Button>
          {!selectionMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              disabled={goals.length === 0}
              className="gap-1.5"
            >
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Select</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="gap-1.5 text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
          )}
          <Button asChild className="gap-2">
            <Link href="/goals/new">
              <Plus className="h-4 w-4" />
              New goal
            </Link>
          </Button>
        </div>
      </div>

      {/* Bulk action bar — shown when in selection mode */}
      {selectionMode && (
        <div className="sticky top-14 z-30 lg:top-16 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
              className="gap-1.5 text-xs"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectedIds.size === goals.length && goals.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </Button>
            <span className="text-xs font-medium text-muted-foreground tabular-nums">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkArchiveMutation.mutate(Array.from(selectedIds))}
              disabled={selectedIds.size === 0 || bulkArchiveMutation.isPending}
              className="gap-1.5 text-xs"
            >
              <Archive className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Archive</span>
            </Button>
            <BulkDeleteButton
              selectedCount={selectedIds.size}
              onDelete={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              deleting={bulkDeleteMutation.isPending}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search goals..."
            className="pl-9"
            aria-label="Search goals"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-full sm:w-[130px]" aria-label="Filter by status">
              <Filter className="mr-1 shrink-0 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filter by category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sort by">
              <ArrowUpDown className="mr-1 shrink-0 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Target className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">No goals match your filters</p>
              <p className="text-xs text-muted-foreground">
                Try a different category, or create a new goal.
              </p>
            </div>
            <Button asChild size="sm" className="gap-2">
              <Link href="/goals/new">
                <Plus className="h-4 w-4" />
                New goal
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const accent = CATEGORY_ACCENTS[g.category ?? 'other'] ?? CATEGORY_ACCENTS.other;
            const isSelected = selectedIds.has(g.id);
            return (
            <li key={g.id}>
              <Card
                className={cn(
                  'relative overflow-hidden transition-all hover:border-primary/40 hover:shadow-md',
                  selectionMode && isSelected && 'border-primary ring-1 ring-primary/40'
                )}
              >
                <div className={cn('absolute inset-y-0 left-0 w-1', accent.bar)} aria-hidden />
                <CardContent className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:p-5 sm:pl-6">
                  {/* Selection checkbox — shown in selection mode */}
                  {selectionMode && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(g.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={isSelected ? `Deselect ${g.title}` : `Select ${g.title}`}
                      aria-pressed={isSelected}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-sm" />
                      )}
                    </button>
                  )}
                  {selectionMode ? (
                    <button
                      type="button"
                      onClick={() => toggleSelect(g.id)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none"
                    >
                      <GoalCardContent g={g} />
                    </button>
                  ) : (
                    <Link
                      href={`/goals/${g.id}`}
                      className="min-w-0 flex-1 focus-visible:outline-none"
                    >
                      <GoalCardContent g={g} />
                    </Link>
                  )}
                  {!selectionMode && (
                    <div className="flex shrink-0 items-center gap-1 sm:flex-col">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Link href={`/goals/${g.id}`}>Open</Link>
                      </Button>
                      <DeleteGoalButton
                        onDelete={() => deleteMutation.mutate(g.id)}
                        deleting={deleteMutation.isPending && deleteMutation.variables === g.id}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DeleteGoalButton({
  onDelete,
  deleting,
}: {
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          aria-label="Delete goal"
        >
          {deleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the goal, its tasks, schedule blocks, and
            progress logs. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BulkDeleteButton({
  selectedCount,
  onDelete,
  deleting,
}: {
  selectedCount: number;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedCount === 0 || deleting}
          className="gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {selectedCount} {selectedCount === 1 ? 'goal' : 'goals'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes {selectedCount} {selectedCount === 1 ? 'goal' : 'goals'}{' '}
            and all of their tasks, schedule blocks, and progress logs. This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete {selectedCount} {selectedCount === 1 ? 'goal' : 'goals'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GoalCardContent({ g }: { g: GoalListItem }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {g.title}
            </h3>
            {g.goalType === 'habit' && (
              <Badge variant="outline" className="shrink-0 text-[0.625rem]">
                Habit
              </Badge>
            )}
            {g.category && (
              <Badge variant="secondary" className="shrink-0 text-[0.625rem]">
                {CATEGORIES.find((c) => c.value === g.category)?.label ?? g.category}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {g.deadline
                ? formatDeadlineRelative(g.deadline)
                : 'No deadline'}
            </span>
            {g.deadline && (
              <DeadlinePill deadline={g.deadline} />
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span className="font-medium text-foreground">
                {formatMinutes(g.remainingMinutes)}
              </span>{' '}
              left
            </span>
            <span>
              <span className="font-semibold text-foreground tabular-nums">
                {g.doneTasks}
              </span>
              <span className="text-muted-foreground">/{g.totalTasks} tasks</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PriorityStar goalId={g.id} priority={g.priority ?? 0} />
          <GoalHealthScore
            progress={g.progress}
            riskLevel={g.latestRisk?.riskLevel ?? 'low'}
            deadline={g.deadline}
          />
          {g.latestRisk && (
            <RiskBadge level={g.latestRisk.riskLevel} showDot className="shrink-0" />
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={g.progress} className="flex-1" />
        <span className="text-xs font-medium tabular-nums text-foreground">
          {g.progress}%
        </span>
      </div>
      {g.latestRisk?.suggestedAction && (
        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
          {g.latestRisk.suggestedAction}
        </p>
      )}
    </>
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

function DeadlinePill({ deadline }: { deadline: string }) {
  const ms = new Date(deadline).getTime() - Date.now();
  const days = ms / (1000 * 60 * 60 * 24);
  let label: string;
  let cls: string;
  if (days <= 0) {
    label = 'Overdue';
    cls = 'border-destructive/40 bg-destructive/10 text-destructive';
  } else if (days <= 1) {
    label = 'Due today';
    cls = 'border-destructive/40 bg-destructive/10 text-destructive';
  } else if (days <= 3) {
    label = `${Math.ceil(days)}d left`;
    cls = 'border-warning/40 bg-warning/15 text-warning-foreground';
  } else if (days <= 7) {
    label = `${Math.ceil(days)}d left`;
    cls = 'border-primary/30 bg-primary/10 text-primary';
  } else {
    return null; // No pill for distant deadlines — keep the card calm.
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[0.625rem] font-semibold',
        cls
      )}
    >
      {label}
    </span>
  );
}
