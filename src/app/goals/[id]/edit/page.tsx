'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Loader2,
  Trash2,
  Archive,
  CheckCircle2,
  RotateCcw,
  Target as TargetIcon,
  Calendar,
  Tag,
  AlertTriangle,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Badge } from '@/components/ui/badge';
import { CATEGORIES } from '@/lib/format';

interface GoalDetail {
  id: string;
  title: string;
  goalType: string;
  deadline: string | null;
  status: string;
  rawInput: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function EditGoalPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ goal: GoalDetail }>({
    queryKey: ['goal', id],
    queryFn: () => api(`/api/goals/${id}`),
    enabled: !!id,
  });

  const [title, setTitle] = React.useState('');
  const [rawInput, setRawInput] = React.useState('');
  const [isHabit, setIsHabit] = React.useState(false);
  const [deadline, setDeadline] = React.useState('');
  const [category, setCategory] = React.useState<string>('');
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate form when data arrives
  React.useEffect(() => {
    if (data?.goal && !hydrated) {
      setTitle(data.goal.title);
      setRawInput(data.goal.rawInput ?? '');
      setIsHabit(data.goal.goalType === 'habit');
      setDeadline(toLocalDatetime(data.goal.deadline));
      setCategory(data.goal.category ?? '');
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        rawInput: rawInput.trim() || null,
        goalType: isHabit ? 'habit' : 'one_time',
        deadline: !isHabit && deadline ? new Date(deadline).toISOString() : null,
        category: category || null,
      };
      return api(`/api/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success('Goal updated');
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      router.push(`/goals/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api(`/api/goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, status) => {
      const verb =
        status === 'completed'
          ? 'marked complete'
          : status === 'abandoned'
            ? 'archived'
            : 'reactivated';
      toast.success(`Goal ${verb}`);
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      if (status === 'abandoned') router.push('/goals');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/api/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Goal deleted');
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      router.push('/goals');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!data?.goal) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <p className="text-sm font-medium">Goal not found</p>
          <Button asChild variant="link" className="mt-2">
            <Link href="/goals">Back to goals</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const goal = data.goal;
  const isCompleted = goal.status === 'completed';
  const isArchived = goal.status === 'abandoned';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <Link href={`/goals/${id}`} aria-label="Back to goal">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit goal</h1>
          <p className="text-sm text-muted-foreground">
            Update the details. Status and deletion are at the bottom.
          </p>
        </div>
      </div>

      {/* Status badges */}
      {(isCompleted || isArchived) && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border p-3 text-sm',
            isCompleted
              ? 'border-success/30 bg-success/5 text-success'
              : 'border-border bg-muted/40 text-muted-foreground'
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          <span>
            This goal is {isCompleted ? 'completed' : 'archived'}. You can still
            edit it, or reactivate it below.
          </span>
        </div>
      )}

      {/* Edit form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title" className="flex items-center gap-1.5 text-sm font-medium">
              <TargetIcon className="h-3.5 w-3.5 text-primary" />
              Goal title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ship hackathon MVP"
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rawInput" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="rawInput"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="Original plain-English description of the goal."
              rows={4}
              maxLength={5000}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="habit" className="text-sm font-medium">
                Type
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Switch
                  id="habit"
                  checked={isHabit}
                  onCheckedChange={setIsHabit}
                />
                <span className="text-sm text-muted-foreground">
                  {isHabit ? 'Habit (no deadline)' : 'One-time goal'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="flex items-center gap-1.5 text-sm font-medium">
                <Tag className="h-3.5 w-3.5 text-primary" />
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isHabit && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="deadline" className="flex items-center gap-1.5 text-sm font-medium">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Deadline
                </Label>
                <Input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pt-0">
          {goal.status !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate('completed')}
              disabled={statusMutation.isPending}
              className="gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark complete
            </Button>
          )}
          {goal.status !== 'abandoned' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate('abandoned')}
              disabled={statusMutation.isPending}
              className="gap-1.5"
            >
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
          {goal.status !== 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate('active')}
              disabled={statusMutation.isPending}
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              Reactivate
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Danger zone
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
                Delete this goal
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
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Sticky action bar */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-xl border border-border bg-background/90 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <Button asChild variant="ghost" className="gap-1.5">
          <Link href={`/goals/${id}`}>Cancel</Link>
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!title.trim() || saveMutation.isPending}
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>

      {goal.status === 'completed' && (
        <div className="flex justify-center pb-4">
          <Badge variant="outline" className="gap-1.5 bg-success/10 text-success border-success/20">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        </div>
      )}
    </div>
  );
}
