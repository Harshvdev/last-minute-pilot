'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/lib/types';

// Mini sparkline that renders a goal's risk history as colored bars.
// Used on the pulse page so users can see escalation at a glance.

const RISK_VALUE: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--destructive)',
  critical: 'var(--destructive)',
};

interface RiskTrendSparklineProps {
  history: { riskLevel: RiskLevel; assessedAt: string }[];
  className?: string;
  // Width in pixels per bar — default 6.
  barWidth?: number;
  // Height of the sparkline in pixels.
  height?: number;
}

export function RiskTrendSparkline({
  history,
  className,
  barWidth = 6,
  height = 28,
}: RiskTrendSparklineProps) {
  if (history.length === 0) {
    return (
      <span className={cn('text-[0.625rem] text-muted-foreground', className)}>
        no history
      </span>
    );
  }

  // Pad to a consistent length (8 max) by repeating the first point at the start.
  // This keeps the sparkline anchored to the right (most recent).
  const MAX = 8;
  const padded: { riskLevel: RiskLevel; assessedAt: string }[] = [];
  if (history.length < MAX) {
    const first = history[0];
    const padding = MAX - history.length;
    for (let i = 0; i < padding; i++) {
      padded.push(first);
    }
  }
  padded.push(...history);
  const trimmed = padded.slice(-MAX);

  const gap = 2;
  const totalWidth = trimmed.length * barWidth + (trimmed.length - 1) * gap;
  const maxH = height - 4;

  return (
    <svg
      width={totalWidth}
      height={height}
      viewBox={`0 0 ${totalWidth} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Risk trend over ${trimmed.length} assessments: most recent ${trimmed[trimmed.length - 1].riskLevel}`}
    >
      {/* Baseline */}
      <line
        x1={0}
        y1={height - 1}
        x2={totalWidth}
        y2={height - 1}
        stroke="var(--muted)"
        strokeWidth={1}
      />
      {trimmed.map((point, i) => {
        const value = RISK_VALUE[point.riskLevel];
        // Bar height proportional to risk level (0..3) → (4..maxH)
        const minH = 3;
        const h = minH + (value / 3) * (maxH - minH);
        const x = i * (barWidth + gap);
        const y = height - 1 - h;
        const isLatest = i === trimmed.length - 1;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={1}
              fill={RISK_COLOR[point.riskLevel]}
              opacity={isLatest ? 1 : 0.7}
            />
            {isLatest && (
              <circle
                cx={x + barWidth / 2}
                cy={y - 2}
                r={1.5}
                fill={RISK_COLOR[point.riskLevel]}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
