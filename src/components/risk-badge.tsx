// Risk badge + colors. Shared across all screens for visual consistency.
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { RiskLevel } from '@/lib/types';
import { RISK_LABEL } from '@/lib/risk/assess';

const RISK_STYLES: Record<RiskLevel, string> = {
  low: 'bg-success/15 text-success border-success/30',
  medium: 'bg-warning/20 text-warning-foreground border-warning/40',
  high: 'bg-destructive/15 text-destructive border-destructive/35',
  critical: 'bg-destructive text-destructive-foreground border-destructive',
};

const RISK_DOT: Record<RiskLevel, string> = {
  low: 'bg-success',
  medium: 'bg-warning',
  high: 'bg-destructive',
  critical: 'bg-white/90 dark:bg-white/90',
};

export function RiskBadge({
  level,
  className,
  showDot = true,
}: {
  level: RiskLevel;
  className?: string;
  showDot?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 font-semibold uppercase tracking-wide text-[0.625rem]',
        RISK_STYLES[level],
        className,
      )}
    >
      {showDot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', RISK_DOT[level])}
          aria-hidden
        />
      )}
      {RISK_LABEL[level]}
    </Badge>
  );
}
