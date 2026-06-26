'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  Activity,
  Settings,
  Plus,
  Sparkles,
  CornerDownLeft,
  Crosshair,
  BarChart3,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';

interface GoalSearchItem {
  id: string;
  title: string;
  goalType: string;
  deadline: string | null;
  status: string;
  category: string | null;
  progress: number;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = React.useState('');

  // Fetch goals for search (only when palette is open)
  const { data } = useQuery<{ goals: GoalSearchItem[] }>({
    queryKey: ['goals'],
    queryFn: () => api('/api/goals'),
    enabled: open,
  });

  const filteredGoals = React.useMemo(() => {
    if (!data?.goals) return [];
    const q = search.trim().toLowerCase();
    const active = data.goals.filter((g) => g.status === 'active');
    if (!q) return active.slice(0, 5);
    return active
      .filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.category ?? '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [data, search]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    setSearch('');
    fn();
  };

  const nav = (path: string) => run(() => router.push(path));

  const replanAll = async () => {
    onOpenChange(false);
    setSearch('');
    const tid = toast.loading('Replanning all goals...');
    try {
      const res = await api<{ goalsProcessed: number }>(
        '/api/schedule/replan',
        { method: 'POST' }
      );
      toast.success(
        `Replanned ${res.goalsProcessed} goal${res.goalsProcessed === 1 ? '' : 's'}.`,
        { id: tid }
      );
      qc.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Replan failed', { id: tid });
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search goals, jump to a page, or run an action."
      className="max-w-xl"
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search goals, jump to a page, or run an action..."
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          {search ? `No matches for "${search}"` : 'Start typing...'}
        </CommandEmpty>

        {/* Quick actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => nav('/goals/new')} className="cursor-pointer">
            <Plus className="text-primary" />
            <span>Create a new goal</span>
            <CommandShortcut>N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => nav('/focus')} className="cursor-pointer">
            <Crosshair className="text-primary" />
            <span>Enter focus mode</span>
            <CommandShortcut>F</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={replanAll} className="cursor-pointer">
            <Sparkles className="text-primary" />
            <span>Replan all goals</span>
          </CommandItem>
        </CommandGroup>

        {/* Navigation */}
        {!search && (
          <CommandGroup heading="Navigate">
            <CommandItem onSelect={() => nav('/')} className="cursor-pointer">
              <LayoutDashboard />
              <span>Dashboard</span>
              <CommandShortcut>G D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => nav('/goals')} className="cursor-pointer">
              <Target />
              <span>Goals</span>
              <CommandShortcut>G G</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => nav('/schedule')} className="cursor-pointer">
              <CalendarDays />
              <span>Schedule</span>
              <CommandShortcut>G S</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => nav('/pulse')} className="cursor-pointer">
              <Activity />
              <span>Pulse</span>
              <CommandShortcut>G P</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => nav('/insights')} className="cursor-pointer">
              <BarChart3 />
              <span>Insights</span>
              <CommandShortcut>G I</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => nav('/settings')} className="cursor-pointer">
              <Settings />
              <span>Settings</span>
              <CommandShortcut>G C</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {/* Goal search results */}
        {filteredGoals.length > 0 && (
          <CommandGroup heading={search ? 'Matching goals' : 'Active goals'}>
            {filteredGoals.map((g) => (
              <CommandItem
                key={g.id}
                onSelect={() => nav(`/goals/${g.id}`)}
                className="cursor-pointer"
              >
                <Target className="text-muted-foreground" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm">{g.title}</span>
                  {g.category && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                      {g.category}
                    </span>
                  )}
                </div>
                <span className="ml-auto shrink-0 text-[0.625rem] tabular-nums text-muted-foreground">
                  {g.progress}%
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[0.625rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="h-2.5 w-2.5" />
          Enter to select
        </span>
        <span>
          <kbd className="rounded border border-border bg-muted px-1 py-0.5">?</kbd> for all shortcuts
        </span>
      </div>
    </CommandDialog>
  );
}
