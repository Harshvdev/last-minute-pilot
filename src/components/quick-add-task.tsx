'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Loader2, Zap } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface GoalOption {
  id: string;
  title: string;
  category: string | null;
}

interface QuickAddResponse {
  task: { id: string; title: string };
}

// Inline quick-add task composer for the dashboard. Lets the user add a task
// to any active goal without leaving the dashboard. Expands from a compact
// trigger button into a small form with goal selector + title + minutes.
export function QuickAddTask() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [goalId, setGoalId] = React.useState<string>('');
  const [minutes, setMinutes] = React.useState('30');

  const { data: goalsData } = useQuery<{ goals: GoalOption[] }>({
    queryKey: ['goals'],
    queryFn: () => api('/api/goals'),
    enabled: open,
  });

  const activeGoals = React.useMemo(
    () => (goalsData?.goals ?? []).filter((g) => g.status === 'active'),
    [goalsData]
  );

  // Auto-select first goal when data arrives
  React.useEffect(() => {
    if (activeGoals.length > 0 && !goalId) {
      setGoalId(activeGoals[0].id);
    }
  }, [activeGoals, goalId]);

  const createMutation = useMutation({
    mutationFn: () =>
      api<QuickAddResponse>(`/api/goals/${goalId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          estimatedMinutes: Math.max(5, Number(minutes) || 30),
        }),
      }),
    onSuccess: () => {
      toast.success('Task added');
      setTitle('');
      setMinutes('30');
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !goalId) return;
    createMutation.mutate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">Quick add task</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px] p-3"
        aria-label="Quick add task"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Quick add task</span>
          </div>

          {/* Goal selector */}
          <div className="space-y-1.5">
            <label className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              To goal
            </label>
            <Select value={goalId} onValueChange={setGoalId}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue placeholder="Select a goal…" />
              </SelectTrigger>
              <SelectContent>
                {activeGoals.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Task title */}
          <div className="space-y-1.5">
            <label className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              Task
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Write the README"
              className="h-9 text-sm"
              autoFocus
              maxLength={200}
            />
          </div>

          {/* Minutes */}
          <div className="space-y-1.5">
            <label className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              Minutes
            </label>
            <div className="flex gap-1.5">
              {['15', '30', '60', '90'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={cn(
                    'flex-1 rounded-md border py-1 text-xs font-medium transition-colors',
                    minutes === m
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {m}m
                </button>
              ))}
              <Input
                type="number"
                min={5}
                max={480}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="h-7 w-16 text-xs"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-1.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || !goalId || createMutation.isPending}
              className="gap-1 text-xs"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Add task
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
