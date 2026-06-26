'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, AlertTriangle, Clock, CalendarClock, Settings as SettingsIcon, CheckCircle2 } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Alert {
  id: string;
  type: 'risk' | 'deadline' | 'upcoming' | 'config';
  severity: 'critical' | 'high' | 'warning' | 'info';
  goalId: string;
  goalTitle: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  createdAt: string;
}

interface NotificationsResponse {
  now: string;
  count: number;
  alerts: Alert[];
}

const SEVERITY_STYLES = {
  critical: {
    icon: AlertTriangle,
    iconColor: 'text-destructive',
    bg: 'bg-destructive/5',
    border: 'border-destructive/20',
  },
  high: {
    icon: AlertTriangle,
    iconColor: 'text-warning',
    bg: 'bg-warning/5',
    border: 'border-warning/20',
  },
  warning: {
    icon: Clock,
    iconColor: 'text-warning',
    bg: 'bg-warning/5',
    border: 'border-warning/20',
  },
  info: {
    icon: Bell,
    iconColor: 'text-primary',
    bg: 'bg-primary/5',
    border: 'border-primary/20',
  },
} as const;

const TYPE_ICONS = {
  risk: AlertTriangle,
  deadline: CalendarClock,
  upcoming: Clock,
  config: SettingsIcon,
} as const;

export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => api('/api/notifications'),
    refetchInterval: 60_000,
  });

  const count = data?.count ?? 0;
  const alerts = data?.alerts ?? [];

  // Mark-as-read simulation: just refetch + dismiss locally.
  // (In production this would PATCH a notification's read status.)
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const visibleCount = visibleAlerts.length;

  const dismiss = (id: string) => {
    setDismissed((s) => new Set(s).add(id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={`Notifications${visibleCount > 0 ? `, ${visibleCount} unread` : ''}`}
        >
          <Bell className="h-[1.05rem] w-[1.05rem]" />
          {visibleCount > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold text-white',
                visibleAlerts.some((a) => a.severity === 'critical')
                  ? 'bg-destructive'
                  : 'bg-primary'
              )}
            >
              {visibleCount > 9 ? '9+' : visibleCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[340px] p-0"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Notifications</span>
          </div>
          {visibleCount > 0 && (
            <Badge variant="secondary" className="text-[0.625rem]">
              {visibleCount} new
            </Badge>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : visibleAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">All clear</p>
              <p className="text-xs text-muted-foreground">
                No risk alerts or upcoming deadlines. You&apos;re on track.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibleAlerts.map((alert) => {
                const s = SEVERITY_STYLES[alert.severity];
                const TypeIcon = TYPE_ICONS[alert.type];
                return (
                  <li
                    key={alert.id}
                    className={cn('group relative p-3 transition-colors hover:bg-accent/40', s.bg)}
                  >
                    <div className="flex gap-2.5">
                      <div
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                          s.bg,
                          s.iconColor
                        )}
                      >
                        <TypeIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs font-semibold text-foreground">
                          {alert.title}
                        </p>
                        <p className="text-[0.6875rem] text-muted-foreground line-clamp-2">
                          {alert.body}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <Link
                            href={alert.actionHref}
                            onClick={() => setOpen(false)}
                            className="inline-flex items-center text-[0.6875rem] font-medium text-primary hover:underline"
                          >
                            {alert.actionLabel}
                          </Link>
                          <button
                            type="button"
                            onClick={() => dismiss(alert.id)}
                            className="text-[0.6875rem] text-muted-foreground hover:text-foreground"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
