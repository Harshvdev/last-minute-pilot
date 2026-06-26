'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { computeHealthScore } from '@/lib/risk/health-score';
import type { RiskLevel } from '@/lib/types';

interface GoalHealthScoreProps {
  progress: number;
  riskLevel: RiskLevel;
  deadline: string | null;
  className?: string;
  // "compact" shows just a colored number; "full" shows label + ring.
  variant?: 'compact' | 'full';
}

const TONE_TEXT: Record<string, string> = {
  success: 'text-success',
  primary: 'text-primary',
  warning: 'text-warning-foreground',
  destructive: 'text-destructive',
};

const TONE_BG: Record<string, string> = {
  success: 'bg-success/15',
  primary: 'bg-primary/15',
  warning: 'bg-warning/20',
  destructive: 'bg-destructive/15',
};

const TONE_RING: Record<string, string> = {
  success: 'var(--success)',
  primary: 'var(--primary)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
};

export function GoalHealthScore({
  progress,
  riskLevel,
  deadline,
  className,
  variant = 'compact',
}: GoalHealthScoreProps) {
  const { score, label, tone } = computeHealthScore({
    progress,
    riskLevel,
    deadline,
  });

  if (variant === 'compact') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-semibold tabular-nums',
          TONE_BG[tone],
          TONE_TEXT[tone],
          className
        )}
        title={`Health: ${score}/100 · ${label}`}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: TONE_RING[tone] }}
          aria-hidden
        />
        {score}
      </span>
    );
  }

  // Full variant: small circular ring + score + label.
  const size = 44;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      title={`Health: ${score}/100 · ${label}`}
    >
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-label={`Goal health: ${score} out of 100, ${label}`}
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
            stroke={TONE_RING[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center text-[0.625rem] font-bold tabular-nums',
            TONE_TEXT[tone]
          )}
        >
          {score}
        </span>
      </div>
      <div className="flex flex-col leading-tight">
        <span className={cn('text-[0.625rem] font-semibold uppercase tracking-wide', TONE_TEXT[tone])}>
          {label}
        </span>
        <span className="text-[0.625rem] text-muted-foreground">Health</span>
      </div>
    </div>
  );
}
