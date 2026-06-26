'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Sparkles,
  Loader2,
  Calendar,
  Target as TargetIcon,
  Tag,
  Plus,
} from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Switch } from '@/components/ui/switch';
import { CATEGORIES } from '@/lib/format';
import { usePreferences } from '@/lib/preferences';
import { GOAL_TEMPLATES, type GoalTemplate } from '@/lib/goal-templates';
import {
  Rocket,
  GraduationCap,
  PenLine,
  Footprints,
  BookOpen,
  Home,
  Lightbulb,
  ChevronDown,
} from 'lucide-react';

interface GoalCreateResponse {
  goal: { id: string };
}

export default function NewGoalPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const prefs = usePreferences();

  const [title, setTitle] = React.useState('');
  const [rawInput, setRawInput] = React.useState('');
  const [isHabit, setIsHabit] = React.useState(false);
  const [deadline, setDeadline] = React.useState('');
  const [category, setCategory] = React.useState<string>(prefs.defaultCategory);
  const [autoBreakdown, setAutoBreakdown] = React.useState(prefs.autoBreakdown);
  const [listening, setListening] = React.useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        rawInput: rawInput.trim() || null,
        goalType: isHabit ? 'habit' : 'one_time',
        deadline: !isHabit && deadline ? new Date(deadline).toISOString() : null,
        category: category || null,
      };
      const created = await api<GoalCreateResponse>('/api/goals', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (autoBreakdown) {
        // Fire breakdown; do not block navigation on it failing.
        try {
          await api(`/api/goals/${created.goal.id}/ai-breakdown`, {
            method: 'POST',
            body: JSON.stringify({ rawInput: rawInput.trim() || undefined }),
          });
          toast.success('Goal created. AI drafted your tasks.');
        } catch (e) {
          console.error(e);
          toast.success('Goal created. You can run AI breakdown from the goal page.');
        }
      } else {
        toast.success('Goal created.');
      }
      return created;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      router.push(`/goals/${created.goal.id}?new=true`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templateMutation = useMutation({
    mutationFn: async (template: GoalTemplate) => {
      const res = await api<{ goal: { id: string }; runBreakdown: boolean }>(
        '/api/goals/from-template',
        {
          method: 'POST',
          body: JSON.stringify({
            templateId: template.id,
            runBreakdown: autoBreakdown,
          }),
        }
      );
      if (res.runBreakdown) {
        try {
          await api(`/api/goals/${res.goal.id}/ai-breakdown`, {
            method: 'POST',
            body: JSON.stringify({ rawInput: template.rawInput }),
          });
        } catch (e) {
          console.error(e);
        }
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success('Goal created from template.');
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      router.push(`/goals/${res.goal.id}?new=true`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyTemplateToForm = (template: GoalTemplate) => {
    setTitle(template.title);
    setRawInput(template.rawInput);
    setIsHabit(template.goalType === 'habit');
    setCategory(template.category);
    if (template.deadlineDaysFromNow !== null) {
      const d = new Date(
        Date.now() + template.deadlineDaysFromNow * 24 * 60 * 60 * 1000
      );
      d.setHours(18, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      setDeadline(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
          d.getHours()
        )}:${pad(d.getMinutes())}`
      );
    } else {
      setDeadline('');
    }
    toast.info(`Template "${template.title}" loaded. Edit and save to create.`);
  };

  // --- Voice input (Web Speech API) ---
  // Adapter per spec §9 — gracefully unavailable on Safari STT.
  const recognitionRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR =
      (window as unknown as { SpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown })
        .webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      setRawInput((prev) => (prev ? prev + ' ' + transcript : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, []);

  const toggleMic = () => {
    const rec = recognitionRef.current as
      | { start: () => void; stop: () => void }
      | null;
    if (!rec) {
      toast.error('Voice input not supported in this browser. Type instead.');
      return;
    }
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      try {
        rec.start();
        setListening(true);
        toast.info('Listening… speak your goal.');
      } catch {
        setListening(false);
      }
    }
  };

  const canSubmit = title.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <span onClick={() => router.back()} role="button" aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </span>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New goal</h1>
          <p className="text-sm text-muted-foreground">
            Describe it the way you would to a friend. Your copilot does the rest.
          </p>
        </div>
      </div>

      {/* Templates */}
      <TemplatePicker
        onUseTemplate={(t) => templateMutation.mutate(t)}
        onEditTemplate={applyTemplateToForm}
        pending={templateMutation.isPending}
      />

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          {/* Title */}
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
              autoFocus
            />
          </div>

          {/* Raw description + voice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rawInput" className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Describe it in plain English
              </Label>
              <Button
                type="button"
                variant={listening ? 'default' : 'outline'}
                size="sm"
                onClick={toggleMic}
                className="gap-1.5"
                aria-pressed={listening}
              >
                {listening ? (
                  <>
                    <MicOff className="h-3.5 w-3.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="h-3.5 w-3.5" />
                    Speak
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="rawInput"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="I have a hackathon in 4 days, haven't started. Need a working demo by Sunday 6pm."
              rows={4}
              className={cn(listening && 'ring-2 ring-primary/40')}
            />
            {listening && (
              <p className="text-xs text-primary">
                Listening… your words will appear as you speak.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The richer your description, the better the AI breakdown. The
              scheduler and risk engine are deterministic — they do not depend
              on the LLM.
            </p>
          </div>

          {/* Type + deadline + category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="habit" className="text-sm font-medium">
                Recurring habit?
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Switch
                  id="habit"
                  checked={isHabit}
                  onCheckedChange={setIsHabit}
                  aria-label="Toggle habit"
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

          {/* Auto-breakdown toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Switch
              id="auto"
              checked={autoBreakdown}
              onCheckedChange={setAutoBreakdown}
              aria-label="Auto AI breakdown"
            />
            <div className="flex-1">
              <Label htmlFor="auto" className="text-sm font-medium cursor-pointer">
                Run AI breakdown now
              </Label>
              <p className="text-xs text-muted-foreground">
                The LLM proposes tasks; a deterministic function ranks them.
                You can rerun this later from the goal page.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sticky action bar — mobile friendly */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-xl border border-border bg-background/90 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <Button
          variant="ghost"
          onClick={() => router.push('/goals')}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit}
          className="gap-2"
        >
          {createMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Create goal
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  GraduationCap,
  PenLine,
  Footprints,
  BookOpen,
  Home,
};

function TemplatePicker({
  onUseTemplate,
  onEditTemplate,
  pending,
}: {
  onUseTemplate: (t: GoalTemplate) => void;
  onEditTemplate: (t: GoalTemplate) => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const popular = GOAL_TEMPLATES.filter((t) => t.popular);
  const rest = GOAL_TEMPLATES.filter((t) => !t.popular);
  const visible = expanded ? GOAL_TEMPLATES : popular;

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Start from a template
              </p>
              <p className="text-xs text-muted-foreground">
                Quick-start a common goal. You can edit everything after.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="gap-1 text-muted-foreground"
          >
            {expanded ? 'Show less' : 'Show all'}
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visible.map((t) => {
            const Icon = TEMPLATE_ICONS[t.icon] ?? TargetIcon;
            return (
              <div
                key={t.id}
                className="group relative flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {t.title}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {t.description}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[0.625rem] text-muted-foreground">
                    <span className="capitalize">{t.category}</span>
                    {t.goalType === 'habit' ? (
                      <span>· Habit</span>
                    ) : (
                      <span>· ~{Math.round(t.estimatedMinutes / 60)}h</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onEditTemplate(t)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onUseTemplate(t)}
                    disabled={pending}
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Use
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {!expanded && rest.length > 0 && (
          <p className="mt-2 text-center text-[0.625rem] text-muted-foreground">
            + {rest.length} more templates
          </p>
        )}
      </CardContent>
    </Card>
  );
}
