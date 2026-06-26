'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  CalendarClock,
  AlertTriangle,
  Save,
  RefreshCw,
  ListChecks,
  CalendarRange,
  ShieldAlert,
  Settings,
  ChevronUp,
  ChevronDown,
  Link2,
  ArrowUpDown,
  Download,
  NotebookPen,
  Trash2 as Trash2Icon,
  Pencil,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RiskBadge } from '@/components/risk-badge';
import { ProgressBar } from '@/components/progress-bar';
import { TaskReorderList } from '@/components/task-reorder-list';
import { TaskDependencyFlow } from '@/components/task-dependency-flow';
import { GoalHealthScore } from '@/components/goal-health-score';
import { ConfettiBurst } from '@/components/confetti-burst';
import {
  AvailabilityEditor,
  type AvailabilityItem,
} from '@/components/availability-editor';
import {
  formatMinutes,
  formatDeadlineRelative,
  formatBlockRange,
  formatDeadline,
  blockDurationMinutes,
  dayLabel,
  CATEGORIES,
} from '@/lib/format';
import type { RiskLevel, TaskStatus } from '@/lib/types';

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
  tasks: TaskDetail[];
  availability: AvailabilityDetail[];
  riskAssessments: RiskAssessmentDetail[];
  notes?: NoteDetail[];
  aiAssumptions?: string[] | null;
}

interface NoteDetail {
  id: string;
  goalId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskDetail {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  priorityScore: number;
  dependsOnId: string | null;
  status: string;
  orderIndex: number;
  scheduleBlocks: { id: string; startAt: string; endAt: string; status: string }[];
  progressLogs: {
    id: string;
    loggedAt: string;
    percentComplete: number;
    note: string | null;
  }[];
}

interface AvailabilityDetail {
  id: string;
  goalId: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  specificDate: string | null;
}

interface RiskAssessmentDetail {
  id: string;
  goalId: string;
  assessedAt: string;
  riskLevel: RiskLevel;
  reason: string | null;
  suggestedAction: string | null;
  remainingWork: number;
  remainingTime: number;
}

export default function GoalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const isNew = searchParams.get('new') === 'true';

  const [showSetupPrompt, setShowSetupPrompt] = React.useState(false);
  const [modalItems, setModalItems] = React.useState<AvailabilityItem[]>([]);

  // AI Planning Assistant States
  const [showPlanningAssistant, setShowPlanningAssistant] = React.useState(false);
  const [currentQuestion, setCurrentQuestion] = React.useState<{ id: string; text: string; options?: string[] | null } | null>(null);
  const [answers, setAnswers] = React.useState<{ questionId: string; answer?: string | null; skipped?: boolean }[]>([]);

  const { data, isLoading, refetch, isFetching } = useQuery<{ goal: GoalDetail }>({
    queryKey: ['goal', id],
    queryFn: () => api(`/api/goals/${id}`),
    enabled: !!id,
  });

  const goal = data?.goal;

  interface BreakdownMutationParams {
    answers?: { questionId: string; answer?: string | null; skipped?: boolean }[];
    force?: boolean;
  }

  const breakdownMutation = useMutation({
    mutationFn: (params: BreakdownMutationParams = {}) =>
      api<{
        status: 'need_clarification' | 'completed';
        question?: { id: string; text: string; options?: string[] | null } | null;
        tasks?: unknown[];
        assumptions?: string[] | null;
        rationale?: string | null;
      }>(`/api/goals/${id}/ai-breakdown`, {
        method: 'POST',
        body: JSON.stringify({
          answers: params.answers,
          force: params.force,
        }),
      }),
    onSuccess: (res) => {
      if (res.status === 'need_clarification' && res.question) {
        setCurrentQuestion(res.question);
      } else {
        setCurrentQuestion(null);
        setShowPlanningAssistant(false);
        toast.success(
          `AI drafted ${res.tasks?.length ?? 0} task${res.tasks?.length === 1 ? '' : 's'}.`
        );
        qc.invalidateQueries({ queryKey: ['goal', id] });
        qc.invalidateQueries({ queryKey: ['stats'] });
      }
    },
    onError: (e: Error) => {
      setCurrentQuestion(null);
      setShowPlanningAssistant(false);
      toast.error(`Breakdown failed: ${e.message}`);
    },
  });

  const startPlanningAssistant = () => {
    setAnswers([]);
    setCurrentQuestion(null);
    setShowPlanningAssistant(true);
    breakdownMutation.mutate({ answers: [] });
  };

  const rescheduleMutation = useMutation({
    mutationFn: () =>
      api<{ scheduled: unknown[]; unscheduled: string[] }>(
        `/api/goals/${id}/reschedule`,
        { method: 'POST' }
      ),
    onSuccess: (res: { scheduled: unknown[]; unscheduled: string[] }) => {
      const planned = res.scheduled.length;
      const missed = res.unscheduled.length;
      if (missed === 0) {
        toast.success(`Scheduled ${planned} block${planned === 1 ? '' : 's'}.`);
      } else {
        toast.warning(
          `Scheduled ${planned} block${planned === 1 ? '' : 's'}, ${missed} task${
            missed === 1 ? '' : 's'
          } didn't fit.`
        );
      }
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(`Reschedule failed: ${e.message}`),
  });

  const riskMutation = useMutation({
    mutationFn: () => api(`/api/goals/${id}/risk`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Risk reassessed.');
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(`Risk check failed: ${e.message}`),
  });

  const saveAvailabilityMutation = useMutation({
    mutationFn: (newItems: AvailabilityItem[]) =>
      api(`/api/goals/${id}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ items: newItems }),
      }),
    onSuccess: () => {
      toast.success('Availability configured');
      qc.invalidateQueries({ queryKey: ['goal', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      rescheduleMutation.mutate();
      setShowSetupPrompt(false);
    },
    onError: (e: Error) => toast.error(`Failed to save availability: ${e.message}`),
  });

  // On mount auto-trigger breakdown if requested
  React.useEffect(() => {
    const trigger = searchParams.get('triggerBreakdown') === 'true';
    if (trigger && goal && goal.tasks.length === 0 && !showPlanningAssistant && answers.length === 0) {
      startPlanningAssistant();
    }
  }, [goal, searchParams]);

  // On onboarding: trigger availability editor ONLY when the breakdown is completed
  React.useEffect(() => {
    const trigger = searchParams.get('triggerBreakdown') === 'true';
    const isPlanningInProgress = trigger && goal && goal.tasks.length === 0;

    if (goal && isNew && goal.availability.length === 0 && !showPlanningAssistant && !isPlanningInProgress) {
      setShowSetupPrompt(true);
      setModalItems([
        {
          dayOfWeek: 1,
          startTime: '18:00',
          endTime: '20:00',
          specificDate: null,
        },
      ]);
    }
  }, [goal, isNew, showPlanningAssistant, searchParams]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!goal) {
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

  const totalTasks = goal.tasks.length;
  const doneTasks = goal.tasks.filter((t) => t.status === 'done').length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const remainingMinutes = goal.tasks
    .filter((t) => t.status !== 'done' && t.status !== 'skipped')
    .reduce((s, t) => s + t.estimatedMinutes, 0);
  const latestRisk = goal.riskAssessments[0];

  return (
    <div className="space-y-6">
      {/* Celebratory banner for completed goals */}
      {goal.status === 'completed' && (
        <div className="animate-pop-in flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Goal completed
            </p>
            <p className="text-xs text-muted-foreground">
              Nice work. You can reactivate it from the edit page if you want to
              keep tracking it.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-success/30 text-success hover:bg-success/10 hover:text-success">
            <Link href={`/goals/${goal.id}/edit`}>
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Link>
          </Button>
        </div>
      )}
      {/* Back + title */}
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
          <Link href="/goals">
            <ArrowLeft className="h-4 w-4" />
            Goals
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
                {goal.title}
              </h1>
              {goal.goalType === 'habit' && (
                <Badge variant="outline">Habit</Badge>
              )}
              {goal.category && (
                <Badge variant="secondary">
                  {CATEGORIES.find((c) => c.value === goal.category)?.label ?? goal.category}
                </Badge>
              )}
              {goal.status === 'completed' && (
                <Badge className="bg-success/15 text-success border-success/30">
                  Completed
                </Badge>
              )}
            </div>
            {goal.rawInput && (
              <p className="max-w-prose text-sm text-muted-foreground text-pretty">
                {goal.rawInput}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              {goal.deadline && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  Due {formatDeadline(goal.deadline)} ({formatDeadlineRelative(goal.deadline)})
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {formatMinutes(remainingMinutes)}
                </span>{' '}
                work left
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-semibold text-foreground tabular-nums">
                  {doneTasks}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="tabular-nums">{totalTasks}</span>{' '}
                tasks done
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <GoalHealthScore
              progress={progress}
              riskLevel={latestRisk?.riskLevel ?? 'low'}
              deadline={goal.deadline}
              variant="full"
            />
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
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href={`/goals/${goal.id}/edit`}>
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Edit</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5" aria-label="Export as markdown">
              <a href={`/api/goals/${goal.id}/export`} download>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </a>
            </Button>
            <Button
              size="sm"
              onClick={() => riskMutation.mutate()}
              disabled={riskMutation.isPending}
              className="gap-1.5"
            >
              {riskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Reassess risk
            </Button>
            </div>
          </div>
        </div>
        <ProgressBar value={progress} className="h-2" />
      </div>

      {/* Risk callout — answers "What happens if I keep going at this pace?" */}
      {latestRisk && latestRisk.riskLevel !== 'low' && (
        <Card
          className={cn(
            'border-l-4',
            latestRisk.riskLevel === 'critical' && 'border-l-destructive',
            latestRisk.riskLevel === 'high' && 'border-l-destructive/80',
            latestRisk.riskLevel === 'medium' && 'border-l-warning'
          )}
        >
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-5 w-5 shrink-0',
                  latestRisk.riskLevel === 'medium' ? 'text-warning' : 'text-destructive'
                )}
              />
              <RiskBadge level={latestRisk.riskLevel} showDot />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {latestRisk.reason && (
                <p className="whitespace-pre-line text-sm text-foreground text-pretty">
                  {latestRisk.reason}
                </p>
              )}
              {latestRisk.suggestedAction && (
                <p className="text-sm">
                  <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">Next action: </span>
                  <span className="text-muted-foreground">
                    {latestRisk.suggestedAction}
                  </span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatMinutes(latestRisk.remainingWork)} of work vs{' '}
                {formatMinutes(latestRisk.remainingTime)} of free time before the deadline.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tasks" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tasks</span>
          </TabsTrigger>
          <TabsTrigger value="schedule" className="gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Schedule</span>
          </TabsTrigger>
          <TabsTrigger value="availability" className="gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Time</span>
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <NotebookPen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Notes</span>
          </TabsTrigger>
        </TabsList>

        {/* Tasks tab */}
        <TabsContent value="tasks" className="mt-4 space-y-3">
          {goal.aiAssumptions && Array.isArray(goal.aiAssumptions) && goal.aiAssumptions.length > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3 text-primary/10 transition-transform group-hover:scale-110">
                <Sparkles className="h-20 w-20 -mr-6 -mt-6" />
              </div>
              <div className="flex items-center gap-2 font-semibold text-primary mb-1.5">
                <Sparkles className="h-4 w-4" />
                AI Assumptions
              </div>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1 text-xs">
                {goal.aiAssumptions.map((ass: string, idx: number) => (
                  <li key={idx}>{ass}</li>
                ))}
              </ul>
              <p className="mt-3 text-[0.6875rem] text-muted-foreground italic border-t border-primary/10 pt-2">
                If these assumptions don&apos;t match your expectations, update the goal description to clarify and click <strong>AI breakdown</strong> to replan.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {totalTasks === 0
                ? 'No tasks yet.'
                : `${doneTasks} of ${totalTasks} done · ranked by deterministic priority`}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={startPlanningAssistant}
                disabled={breakdownMutation.isPending}
                className="gap-1.5"
              >
                {breakdownMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">AI breakdown</span>
                <span className="sm:hidden">AI</span>
              </Button>
            </div>
          </div>

          {totalTasks === 0 ? (
            <div className="space-y-4">
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No tasks yet</p>
                    <p className="text-xs text-muted-foreground">
                      Run AI breakdown to draft tasks, or add one manually below.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={startPlanningAssistant}
                    disabled={breakdownMutation.isPending}
                    className="gap-1.5"
                  >
                    {breakdownMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Run AI breakdown
                  </Button>
                </CardContent>
              </Card>
              <TaskList goalId={id} tasks={[]} />
            </div>
          ) : (
            <>
              <TaskDependencyFlow
                tasks={goal.tasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  estimatedMinutes: t.estimatedMinutes,
                  status: t.status as TaskStatus,
                  dependsOnId: t.dependsOnId,
                  orderIndex: t.orderIndex,
                }))}
              />
              <TaskList goalId={id} tasks={goal.tasks} />
            </>
          )}
        </TabsContent>

        {/* Schedule tab */}
        <TabsContent value="schedule" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Deterministic bin-packing into your availability windows.
            </p>
            <Button
              size="sm"
              onClick={() => rescheduleMutation.mutate()}
              disabled={rescheduleMutation.isPending}
              className="gap-1.5"
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-fit schedule
            </Button>
          </div>
          <ScheduleView tasks={goal.tasks} />
        </TabsContent>

        {/* Availability tab */}
        <TabsContent value="availability" className="mt-4 space-y-3">
          <AvailabilityTab goalId={id} initial={goal.availability} />
        </TabsContent>

        {/* Notes tab */}
        <TabsContent value="notes" className="mt-4 space-y-3">
          <NotesTab goalId={id} initialNotes={goal.notes ?? []} />
        </TabsContent>
      </Tabs>

      {/* Risk history */}
      {goal.riskAssessments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Risk history
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {goal.riskAssessments.slice(0, 8).map((r) => (
                <li
                  key={r.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <RiskBadge level={r.riskLevel} showDot className="shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    {r.reason && (
                      <p className="whitespace-pre-line text-xs text-foreground text-pretty">
                        {r.reason}
                      </p>
                    )}
                    {r.suggestedAction && (
                      <p className="text-xs">
                        <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
                        <span className="text-muted-foreground">{r.suggestedAction}</span>
                      </p>
                    )}
                    <p className="text-[0.6875rem] text-muted-foreground">
                      {new Date(r.assessedAt).toLocaleString()} ·{' '}
                      {formatMinutes(r.remainingWork)} work /{' '}
                      {formatMinutes(r.remainingTime)} free time
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AI Planning Assistant Modal */}
      <Dialog
        open={showPlanningAssistant}
        onOpenChange={(open) => {
          if (!open && !breakdownMutation.isPending) {
            setShowPlanningAssistant(false);
          }
        }}
      >
        <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <DialogTitle className="text-lg font-semibold">AI Planning Assistant</DialogTitle>
            </div>
            <DialogDescription className="text-xs">
              Refining task breakdown for your goal: <strong className="text-foreground">{goal.title}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {breakdownMutation.isPending && !currentQuestion ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">AI is analyzing goal details...</p>
              </div>
            ) : currentQuestion ? (
              <div className="space-y-4">
                {/* Question Display */}
                <div className="space-y-2">
                  <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-primary">
                    Clarification Turn {answers.length + 1} of 3
                  </span>
                  <p className="text-sm font-medium leading-relaxed text-foreground">
                    {currentQuestion.text}
                  </p>
                </div>

                {/* Option Pills */}
                {currentQuestion.options && currentQuestion.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {currentQuestion.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          const newAnswers = [...answers, { questionId: currentQuestion.id, answer: opt }];
                          setAnswers(newAnswers);
                          setCurrentQuestion(null);
                          breakdownMutation.mutate({ answers: newAnswers });
                        }}
                        disabled={breakdownMutation.isPending}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom Text input */}
                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="customAnswer" className="text-xs font-medium text-muted-foreground">
                    Or type your own details:
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="customAnswer"
                      placeholder="Type details here..."
                      disabled={breakdownMutation.isPending}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val) {
                            const newAnswers = [...answers, { questionId: currentQuestion.id, answer: val }];
                            setAnswers(newAnswers);
                            setCurrentQuestion(null);
                            breakdownMutation.mutate({ answers: newAnswers });
                          }
                        }
                      }}
                      className="text-xs h-9"
                    />
                    <Button
                      size="sm"
                      disabled={breakdownMutation.isPending}
                      onClick={() => {
                        const inputEl = document.getElementById('customAnswer') as HTMLInputElement;
                        const val = inputEl?.value.trim();
                        if (val) {
                          const newAnswers = [...answers, { questionId: currentQuestion.id, answer: val }];
                          setAnswers(newAnswers);
                          setCurrentQuestion(null);
                          breakdownMutation.mutate({ answers: newAnswers });
                        }
                      }}
                    >
                      {breakdownMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Submit'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">Generating final tasks plan...</p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between border-t border-border/40 pt-4 mt-2">
            {currentQuestion ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={breakdownMutation.isPending}
                  onClick={() => {
                    const newAnswers = [...answers, { questionId: currentQuestion.id, skipped: true }];
                    setAnswers(newAnswers);
                    setCurrentQuestion(null);
                    breakdownMutation.mutate({ answers: newAnswers });
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Skip question
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={breakdownMutation.isPending}
                  onClick={() => {
                    setCurrentQuestion(null);
                    breakdownMutation.mutate({ answers, force: true });
                  }}
                  className="text-xs border-dashed gap-1"
                >
                  <Sparkles className="h-3 w-3 text-primary" />
                  Skip all & plan
                </Button>
              </>
            ) : (
              <div className="w-full text-center text-xs text-muted-foreground">
                Analyzing requirements...
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Availability Modal (Onboarding Popup right after goal creation) */}
      <Dialog open={showSetupPrompt} onOpenChange={setShowSetupPrompt}>
        <DialogContent className="max-w-[calc(100%-1.5rem)] sm:max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Set your availability</DialogTitle>
            <DialogDescription>
              To schedule tasks and estimate schedule risk, the copilot needs to know when you can work on this goal.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <AvailabilityEditor items={modalItems} onChange={setModalItems} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setShowSetupPrompt(false)}
              disabled={saveAvailabilityMutation.isPending}
            >
              Skip
            </Button>
            <Button
              onClick={() => saveAvailabilityMutation.mutate(modalItems)}
              disabled={saveAvailabilityMutation.isPending}
              className="gap-1.5"
            >
              {saveAvailabilityMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Task list with progress logging ----------

function TaskList({ goalId, tasks }: { goalId: string; tasks: TaskDetail[] }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = React.useState('');
  const [newMins, setNewMins] = React.useState('30');
  const [reorderMode, setReorderMode] = React.useState(false);
  const [confettiTrigger, setConfettiTrigger] = React.useState(0);

  const batchReorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await api(`/api/goals/${goalId}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedTaskIds: orderedIds }),
      });
    },
    onSuccess: () => {
      toast.success('Task order saved');
      setReorderMode(false);
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
    },
    onError: (e: Error) => toast.error(`Reorder failed: ${e.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { taskId: string; status?: TaskStatus; wasDone?: boolean }) =>
      api(`/api/goals/${goalId}/tasks/${vars.taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: (_data, vars) => {
      // Fire confetti only when transitioning to "done" (not un-done).
      if (vars.status === 'done' && !vars.wasDone) {
        setConfettiTrigger((n) => n + 1);
        toast.success('Task complete');
      }
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['streaks'] });
      qc.invalidateQueries({ queryKey: ['priorities'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) =>
      api(`/api/goals/${goalId}/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Optimistic reorder: swap orderIndex of two tasks, then persist.
  const reorderMutation = useMutation({
    mutationFn: async (vars: { taskId: string; direction: 'up' | 'down' }) => {
      const idx = tasks.findIndex((t) => t.id === vars.taskId);
      if (idx === -1) return;
      const swapIdx = vars.direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= tasks.length) return;
      const a = tasks[idx];
      const b = tasks[swapIdx];
      await Promise.all([
        api(`/api/goals/${goalId}/tasks/${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderIndex: b.orderIndex }),
        }),
        api(`/api/goals/${goalId}/tasks/${b.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ orderIndex: a.orderIndex }),
        }),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
    },
    onError: (e: Error) => toast.error(`Reorder failed: ${e.message}`),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api(`/api/goals/${goalId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          estimatedMinutes: Math.max(5, Number(newMins) || 30),
        }),
      }),
    onSuccess: () => {
      setNewTitle('');
      setNewMins('30');
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <ConfettiBurst trigger={confettiTrigger} message="Done!" />
      {/* Reorder toggle */}
      {tasks.length > 1 && !reorderMode && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReorderMode(true)}
            className="gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Reorder tasks
          </Button>
        </div>
      )}

      {/* Reorder mode (drag-and-drop) */}
      {reorderMode ? (
        <TaskReorderList
          tasks={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            estimatedMinutes: t.estimatedMinutes,
            status: t.status,
            orderIndex: t.orderIndex,
          }))}
          onReorder={async (orderedIds) => {
            await batchReorderMutation.mutateAsync(orderedIds);
          }}
          onCancel={() => setReorderMode(false)}
        />
      ) : (
        tasks.length > 0 && (
          <Accordion type="multiple" className="space-y-2">
            {tasks.map((t, idx) => {
              const isDone = t.status === 'done';
              const isInProgress = t.status === 'in_progress';
              const lastLog = t.progressLogs[0];
              return (
                <AccordionItem
                  key={t.id}
                  value={t.id}
                  className="overflow-hidden rounded-lg border border-border bg-card data-[state=open]:bg-card"
                >
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateMutation.mutate({
                          taskId: t.id,
                          status: isDone ? 'pending' : 'done',
                          wasDone: isDone,
                        })
                      }
                      className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <AccordionTrigger
                      className="flex-1 hover:no-underline px-1 py-2"
                      disabled={false}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <span
                          className={cn(
                            'text-[0.625rem] font-semibold tabular-nums',
                            isDone ? 'text-muted-foreground/60' : 'text-primary/70'
                          )}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className={cn(
                            'truncate text-sm font-medium',
                            isDone && 'text-muted-foreground line-through',
                            isInProgress && 'text-foreground'
                          )}
                        >
                          {t.title}
                        </span>
                        {t.dependsOnId && (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-warning-foreground"
                            title={`Depends on: ${
                              tasks.find((x) => x.id === t.dependsOnId)?.title ?? 'a previous task'
                            }`}
                          >
                            <Link2 className="h-2.5 w-2.5" />
                            <span className="hidden sm:inline">blocked</span>
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span className="hidden text-xs font-medium text-muted-foreground sm:mr-1 sm:inline">
                        {formatMinutes(t.estimatedMinutes)}
                      </span>
                      {isInProgress && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[0.625rem]">
                          In progress
                        </Badge>
                      )}
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground/60 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderMutation.mutate({ taskId: t.id, direction: 'up' });
                          }}
                          disabled={idx === 0 || reorderMutation.isPending}
                          aria-label="Move task up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-muted-foreground/60 hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderMutation.mutate({ taskId: t.id, direction: 'down' });
                          }}
                          disabled={idx === tasks.length - 1 || reorderMutation.isPending}
                          aria-label="Move task down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <AccordionContent className="px-3 pb-3 pt-0">
                    <div className="space-y-3 border-t border-border pt-3">
                      {t.description && (
                        <p className="text-xs text-muted-foreground text-pretty">{t.description}</p>
                      )}
                      <ProgressLogger
                        taskId={t.id}
                        goalId={goalId}
                        currentPercent={lastLog?.percentComplete ?? 0}
                        lastNote={lastLog?.note ?? null}
                      />
                      {t.progressLogs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
                            Recent logs
                          </p>
                          <ul className="space-y-1">
                            {t.progressLogs.slice(0, 3).map((log) => (
                              <li key={log.id} className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{log.percentComplete}%</span>
                                {' · '}
                                {new Date(log.loggedAt).toLocaleString()}
                                {log.note && <span> · {log.note}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(t.id)}
                          disabled={deleteMutation.isPending}
                          className="gap-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete task
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )
      )}

      {/* Add task */}
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="newtask" className="text-xs text-muted-foreground">
            Add a task
          </Label>
          <Input
            id="newtask"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. Write the README"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) addMutation.mutate();
            }}
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="w-24 space-y-1.5">
            <Label htmlFor="mins" className="text-xs text-muted-foreground">
              Minutes
            </Label>
            <Input
              id="mins"
              type="number"
              min={5}
              max={480}
              value={newMins}
              onChange={(e) => setNewMins(e.target.value)}
            />
          </div>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newTitle.trim() || addMutation.isPending}
            className="gap-1.5"
          >
            {addMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProgressLogger({
  taskId,
  goalId,
  currentPercent,
  lastNote,
}: {
  taskId: string;
  goalId: string;
  currentPercent: number;
  lastNote: string | null;
}) {
  const qc = useQueryClient();
  const [percent, setPercent] = React.useState(String(currentPercent));
  const [note, setNote] = React.useState('');

  React.useEffect(() => setPercent(String(currentPercent)), [currentPercent]);

  const logMutation = useMutation({
    mutationFn: () =>
      api(`/api/goals/${goalId}/tasks/${taskId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          percentComplete: Math.max(0, Math.min(100, Number(percent) || 0)),
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      toast.success('Progress logged');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Label htmlFor={`pct-${taskId}`} className="text-xs text-muted-foreground shrink-0">
          Progress
        </Label>
        <input
          id={`pct-${taskId}`}
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <span className="w-10 text-right text-xs font-medium tabular-nums text-foreground">
          {percent}%
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (what you finished or hit)"
          className="h-9 text-xs"
        />
        <Button
          size="sm"
          onClick={() => logMutation.mutate()}
          disabled={logMutation.isPending}
          className="h-9 gap-1.5"
        >
          {logMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Log
        </Button>
      </div>
      {lastNote && (
        <p className="text-[0.6875rem] text-muted-foreground">Last: {lastNote}</p>
      )}
    </div>
  );
}

// ---------- Schedule view ----------

function ScheduleView({ tasks }: { tasks: TaskDetail[] }) {
  const blocks = React.useMemo(() => {
    const all: {
      id: string;
      startAt: string;
      endAt: string;
      status: string;
      task: TaskDetail;
    }[] = [];
    for (const t of tasks) {
      for (const b of t.scheduleBlocks) {
        all.push({ ...b, task: t });
      }
    }
    all.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    return all;
  }, [tasks]);

  // Group by day
  const byDay = React.useMemo(() => {
    const map = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const key = new Date(b.startAt).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries());
  }, [blocks]);

  if (blocks.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No schedule blocks yet</p>
            <p className="text-xs text-muted-foreground">
              Make sure availability is set, then click &ldquo;Re-fit schedule&rdquo;.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {byDay.map(([dayKey, dayBlocks]) => {
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
                  {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </h4>
              <span className="text-xs text-muted-foreground">
                {formatMinutes(totalMin)} planned
              </span>
            </div>
            <ul className="space-y-1.5">
              {dayBlocks.map((b) => (
                <li
                  key={b.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
                    b.status === 'completed' && 'opacity-70',
                    b.status === 'missed' && 'border-destructive/30 bg-destructive/5'
                  )}
                >
                  <div className="flex w-24 shrink-0 flex-col text-xs">
                    <span className="font-medium text-foreground">
                      {formatBlockRange(b.startAt, b.endAt).split(' – ')[0]}
                    </span>
                    <span className="text-muted-foreground">
                      {formatMinutes(blockDurationMinutes(b.startAt, b.endAt))}
                    </span>
                  </div>
                  <div className="h-9 w-0.5 rounded-full bg-primary/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {b.task.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatMinutes(b.task.estimatedMinutes)} est
                    </p>
                  </div>
                  {b.status === 'completed' && (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[0.625rem]">
                      Done
                    </Badge>
                  )}
                  {b.status === 'missed' && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[0.625rem]">
                      Missed
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Availability tab ----------

function AvailabilityTab({
  goalId,
  initial,
}: {
  goalId: string;
  initial: AvailabilityDetail[];
}) {
  const qc = useQueryClient();
  const [items, setItems] = React.useState<AvailabilityItem[]>(
    initial.map((a) => ({
      id: a.id,
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
      specificDate: a.specificDate,
    }))
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      api(`/api/goals/${goalId}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => {
      toast.success('Availability saved');
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            When can you actually work on this?
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <AvailabilityEditor items={items} onChange={setItems} />
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-1.5"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save availability
        </Button>
      </div>
    </div>
  );
}

// ---------- Notes tab ----------

function NotesTab({
  goalId,
  initialNotes,
}: {
  goalId: string;
  initialNotes: NoteDetail[];
}) {
  const qc = useQueryClient();
  const [notes, setNotes] = React.useState<NoteDetail[]>(initialNotes);
  const [draft, setDraft] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editBody, setEditBody] = React.useState('');

  React.useEffect(() => setNotes(initialNotes), [initialNotes]);

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ note: NoteDetail }>(`/api/goals/${goalId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: draft.trim() }),
      }),
    onSuccess: (res) => {
      setNotes((prev) => [res.note, ...prev]);
      setDraft('');
      qc.invalidateQueries({ queryKey: ['goal', goalId] });
      toast.success('Note added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (noteId: string) =>
      api(`/api/goals/${goalId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editBody.trim() }),
      }),
    onSuccess: (_data, noteId) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, body: editBody.trim() } : n
        )
      );
      setEditingId(null);
      setEditBody('');
      toast.success('Note updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api(`/api/goals/${goalId}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (_data, noteId) => {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success('Note deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (note: NoteDetail) => {
    setEditingId(note.id);
    setEditBody(note.body);
  };

  return (
    <div className="space-y-3">
      {/* Composer */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Jot a note — context, decisions, blockers, links…"
            rows={3}
            className="resize-none border-0 p-0 text-sm focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[0.625rem] text-muted-foreground">
              {draft.length}/10000
            </span>
            <Button
              size="sm"
              onClick={() => createMutation.mutate()}
              disabled={!draft.trim() || createMutation.isPending}
              className="gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add note
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes list */}
      {notes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <NotebookPen className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No notes yet</p>
              <p className="text-xs text-muted-foreground">
                Capture decisions, context, and blockers as you work.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li
              key={note.id}
              className="stagger-item rounded-lg border border-border bg-card p-3"
            >
              {editingId === note.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={3}
                    className="resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditBody('');
                      }}
                      className="text-xs text-muted-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate(note.id)}
                      disabled={!editBody.trim() || updateMutation.isPending}
                      className="gap-1 text-xs"
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group">
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    {note.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[0.625rem] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(note)}
                        aria-label="Edit note"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(note.id)}
                        disabled={deleteMutation.isPending}
                        aria-label="Delete note"
                      >
                        <Trash2Icon className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Keep import used (ChevronDown) — reserved for accordion arrow fallback.
