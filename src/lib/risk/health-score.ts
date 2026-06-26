// Goal health score — a single deterministic 0-100 number per goal that
// combines progress, deadline urgency, risk level, and momentum.
//
// Higher = healthier. Designed to be glanceable on goal cards.
//
// Formula:
//   base = progress% (0-100)
//   riskPenalty: critical=40, high=25, medium=12, low=0
//   deadlinePenalty:
//     - Overdue: +25 penalty (capped)
//     - ≤1 day: +20
//     - ≤3 days: +12
//     - ≤7 days: +5
//     - >7 days: 0
//     - No deadline (habit): +0 (neutral)
//   final = clamp(0, 100, base − riskPenalty − deadlinePenalty)
//
// The score is color-coded:
//   ≥75: success (green) — "on track"
//   50-74: primary (emerald) — "steady"
//   30-49: warning (amber) — "watch"
//   <30: destructive (red) — "at risk"

import type { RiskLevel } from '@/lib/types';

export interface HealthScoreInput {
  progress: number; // 0-100
  riskLevel: RiskLevel;
  deadline: string | null; // ISO date
  now?: Date;
}

export interface HealthScore {
  score: number; // 0-100, rounded
  label: 'On track' | 'Steady' | 'Watch' | 'At risk';
  tone: 'success' | 'primary' | 'warning' | 'destructive';
}

const RISK_PENALTY: Record<RiskLevel, number> = {
  low: 0,
  medium: 12,
  high: 25,
  critical: 40,
};

export function computeHealthScore(input: HealthScoreInput): HealthScore {
  const { progress, riskLevel, deadline } = input;
  const now = input.now ?? new Date();

  let base = Math.max(0, Math.min(100, progress));
  const riskPenalty = RISK_PENALTY[riskLevel];

  let deadlinePenalty = 0;
  if (deadline) {
    const ms = new Date(deadline).getTime() - now.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    if (days <= 0) deadlinePenalty = 25;
    else if (days <= 1) deadlinePenalty = 20;
    else if (days <= 3) deadlinePenalty = 12;
    else if (days <= 7) deadlinePenalty = 5;
  }

  const score = Math.max(0, Math.min(100, Math.round(base - riskPenalty - deadlinePenalty)));

  let label: HealthScore['label'];
  let tone: HealthScore['tone'];
  if (score >= 75) {
    label = 'On track';
    tone = 'success';
  } else if (score >= 50) {
    label = 'Steady';
    tone = 'primary';
  } else if (score >= 30) {
    label = 'Watch';
    tone = 'warning';
  } else {
    label = 'At risk';
    tone = 'destructive';
  }

  return { score, label, tone };
}
