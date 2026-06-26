'use client';

import * as React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// A pomodoro-style focus timer with a circular progress ring.
// - Default duration comes from the scheduled block's estimated minutes.
// - User can start/pause/reset.
// - Persists elapsed time in localStorage so a refresh doesn't lose progress.
// - When the timer completes, fires onComplete (used to surface a "Mark done" prompt).

interface FocusTimerProps {
  // Total minutes for the timer (e.g. block duration).
  totalMinutes: number;
  // Storage key — keeps timer state unique per task.
  storageKey: string;
  onComplete?: () => void;
}

type TimerState = 'idle' | 'running' | 'paused' | 'done';

interface PersistedState {
  state: TimerState;
  // Unix ms timestamp when the timer was started (or last resumed).
  startedAt: number | null;
  // Total elapsed ms accumulated during previous running segments.
  accumulatedMs: number;
  // Total duration ms (in case the user changes it later).
  totalMs: number;
}

const TICK_MS = 1000;

export function FocusTimer({ totalMinutes, storageKey, onComplete }: FocusTimerProps) {
  const totalMs = Math.max(1, totalMinutes) * 60 * 1000;

  const [persisted, setPersisted] = React.useState<PersistedState>(() => {
    if (typeof window === 'undefined') {
      return { state: 'idle', startedAt: null, accumulatedMs: 0, totalMs };
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { state: 'idle', startedAt: null, accumulatedMs: 0, totalMs };
      const parsed = JSON.parse(raw) as PersistedState;
      // If the total duration changed, reset to idle to avoid weird states.
      if (parsed.totalMs !== totalMs) {
        return { state: 'idle', startedAt: null, accumulatedMs: 0, totalMs };
      }
      return parsed;
    } catch {
      return { state: 'idle', startedAt: null, accumulatedMs: 0, totalMs };
    }
  });

  // Track the live elapsed ms for rendering the ring.
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (persisted.state !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [persisted.state]);

  // Check for completion.
  React.useEffect(() => {
    if (persisted.state !== 'running') return;
    const elapsed = computeElapsed(persisted, now);
    if (elapsed >= totalMs) {
      const finalState: PersistedState = {
        ...persisted,
        state: 'done',
        accumulatedMs: totalMs,
        startedAt: null,
        totalMs,
      };
      setPersisted(finalState);
      onComplete?.();
    }
  }, [now, persisted, totalMs, onComplete]);

  // Persist on every change.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      // ignore quota errors
    }
  }, [persisted, storageKey]);

  const elapsedMs = computeElapsed(persisted, Date.now());
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const progress = Math.min(1, elapsedMs / totalMs);

  const handleStart = () => {
    setPersisted((p) => ({
      ...p,
      state: 'running',
      startedAt: Date.now(),
      totalMs,
    }));
  };

  const handlePause = () => {
    setPersisted((p) => {
      if (p.state !== 'running' || p.startedAt == null) return p;
      const additional = Date.now() - p.startedAt;
      return {
        ...p,
        state: 'paused',
        startedAt: null,
        accumulatedMs: p.accumulatedMs + additional,
      };
    });
  };

  const handleReset = () => {
    setPersisted({ state: 'idle', startedAt: null, accumulatedMs: 0, totalMs });
  };

  const displayState: TimerState = persisted.state;

  return (
    <div className="flex flex-col items-center gap-4">
      <ProgressRing
        progress={progress}
        state={displayState}
        remainingMs={remainingMs}
        totalMs={totalMs}
      />
      <div className="flex items-center gap-2">
        {displayState === 'idle' && (
          <Button
            type="button"
            onClick={handleStart}
            className="gap-2"
            aria-label="Start focus timer"
          >
            <Play className="h-4 w-4" />
            Start timer
          </Button>
        )}
        {displayState === 'running' && (
          <Button
            type="button"
            variant="outline"
            onClick={handlePause}
            className="gap-2"
            aria-label="Pause focus timer"
          >
            <Pause className="h-4 w-4" />
            Pause
          </Button>
        )}
        {displayState === 'paused' && (
          <Button
            type="button"
            onClick={handleStart}
            className="gap-2"
            aria-label="Resume focus timer"
          >
            <Play className="h-4 w-4" />
            Resume
          </Button>
        )}
        {displayState === 'done' && (
          <div className="rounded-md bg-success/15 px-3 py-1.5 text-sm font-medium text-success">
            Time&apos;s up — nice focus.
          </div>
        )}
        {(displayState === 'running' || displayState === 'paused' || displayState === 'done') && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 text-muted-foreground"
            aria-label="Reset focus timer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

function computeElapsed(p: PersistedState, currentMs: number): number {
  if (p.state === 'running' && p.startedAt != null) {
    return p.accumulatedMs + (currentMs - p.startedAt);
  }
  return p.accumulatedMs;
}

function ProgressRing({
  progress,
  state,
  remainingMs,
  totalMs,
}: {
  progress: number;
  state: TimerState;
  remainingMs: number;
  totalMs: number;
}) {
  const size = 200;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Draw the progress as a filled arc starting from the top (-90deg).
  const offset = circumference * (1 - progress);

  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const totalMin = Math.round(totalMs / 60000);

  return (
    <div className="relative">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-label={`Focus timer: ${remainingMin} minutes ${remainingSec} seconds remaining of ${totalMin} minutes`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={state === 'done' ? 'var(--success)' : 'var(--primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            'transition-[stroke-dashoffset] duration-1000 ease-linear',
            state === 'running' && 'animate-soft-pulse'
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
          {state === 'idle' && 'Ready'}
          {state === 'running' && 'Focusing'}
          {state === 'paused' && 'Paused'}
          {state === 'done' && 'Complete'}
        </span>
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
          {String(remainingMin).padStart(2, '0')}:
          {String(remainingSec).padStart(2, '0')}
        </span>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
          of {totalMin}m
        </span>
      </div>
    </div>
  );
}
