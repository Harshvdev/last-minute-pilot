'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  RotateCcw,
  Clock,
  Sparkles,
  LayoutDashboard,
  CalendarRange,
  Check,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  usePreferences,
  type ThemePreference,
  type DefaultCategory,
} from '@/lib/preferences';
import { useTheme } from 'next-themes';
import { CATEGORIES, DAYS_OF_WEEK } from '@/lib/format';

export default function SettingsPage() {
  const prefs = usePreferences();
  const { setTheme } = useTheme();

  // Sync theme preference to next-themes
  React.useEffect(() => {
    setTheme(prefs.theme);
  }, [prefs.theme, setTheme]);

  const handleReset = () => {
    prefs.resetToDefaults();
    toast.success('Preferences reset to defaults');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Settings
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Preferences are saved locally on this device.
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sun className="h-4 w-4 text-primary" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Theme</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => prefs.setTheme(opt.value as ThemePreference)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    prefs.theme === opt.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent/50'
                  )}
                  aria-pressed={prefs.theme === opt.value}
                >
                  <opt.icon className="h-4 w-4" />
                  {opt.label}
                  {prefs.theme === opt.value && (
                    <Check className="h-3 w-3 text-primary" />
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              System follows your device preference. The toggle in the top bar
              also switches this.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            Defaults for new goals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="cat" className="text-sm font-medium">
              Default category
            </Label>
            <Select
              value={prefs.defaultCategory}
              onValueChange={(v) => prefs.setDefaultCategory(v as DefaultCategory)}
            >
              <SelectTrigger id="cat" className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pre-selected on the New Goal form.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <Switch
              id="auto"
              checked={prefs.autoBreakdown}
              onCheckedChange={prefs.setAutoBreakdown}
            />
            <div className="flex-1">
              <Label htmlFor="auto" className="cursor-pointer text-sm font-medium">
                Run AI breakdown on new goals
              </Label>
              <p className="text-xs text-muted-foreground">
                When you create a goal, the copilot drafts tasks automatically.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default work windows */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-4 w-4 text-primary" />
            Default work windows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <p className="mb-2 text-xs text-muted-foreground">
            Pre-filled when you add availability to a new goal. Toggle a day off
            to skip it by default.
          </p>
          <ul className="space-y-1.5">
            {prefs.workWindows.map((w, idx) => {
              const day = DAYS_OF_WEEK.find((d) => d.value === w.dayOfWeek);
              return (
                <li
                  key={w.dayOfWeek}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-2.5 transition-colors',
                    w.enabled
                      ? 'border-border bg-card'
                      : 'border-dashed border-border bg-muted/20 opacity-70'
                  )}
                >
                  <Switch
                    checked={w.enabled}
                    onCheckedChange={() => prefs.toggleWorkWindow(idx)}
                    aria-label={`Toggle ${day?.label}`}
                  />
                  <span className="w-12 shrink-0 text-xs font-medium text-foreground">
                    {day?.short}
                  </span>
                  <div className="flex flex-1 items-center gap-1.5">
                    <Input
                      type="time"
                      value={w.startTime}
                      onChange={(e) =>
                        prefs.setWorkWindow(idx, { startTime: e.target.value })
                      }
                      className="h-8 w-full sm:w-[100px] text-xs"
                      disabled={!w.enabled}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={w.endTime}
                      onChange={(e) =>
                        prefs.setWorkWindow(idx, { endTime: e.target.value })
                      }
                      className="h-8 w-full sm:w-[100px] text-xs"
                      disabled={!w.enabled}
                    />
                  </div>
                  {w.enabled && (
                    <Badge variant="outline" className="hidden shrink-0 text-[0.625rem] sm:inline">
                      {w.endTime && w.startTime
                        ? `${diffHours(w.startTime, w.endTime)}h`
                        : ''}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Dashboard preferences */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            Dashboard &amp; schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <ToggleRow
            id="pace"
            label="Show pace projection card"
            description="Forecasts whether you'll hit deadlines at your current velocity."
            checked={prefs.showPaceProjection}
            onCheckedChange={prefs.setShowPaceProjection}
          />
          <ToggleRow
            id="timeline"
            label="Show weekly timeline"
            description="Visual 7-day grid on the Schedule page."
            checked={prefs.showWeeklyTimeline}
            onCheckedChange={prefs.setShowWeeklyTimeline}
            icon={CalendarRange}
          />
          <div className="space-y-2">
            <Label className="text-sm font-medium">First day of week</Label>
            <Select
              value={String(prefs.firstDayOfWeek)}
              onValueChange={(v) =>
                prefs.setFirstDayOfWeek(Number(v) as 0 | 1)
              }
            >
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-destructive">
            Reset
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <RotateCcw className="h-4 w-4" />
                Reset to defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all preferences?</AlertDialogTitle>
                <AlertDialogDescription>
                  This restores theme, default category, work windows, and
                  dashboard toggles to their defaults. Your goals and tasks are
                  not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  icon: Icon,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <div className="flex-1">
        <Label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function diffHours(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}
