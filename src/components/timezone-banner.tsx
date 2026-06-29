'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, X, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

interface StatsResponse {
  userTimezone?: string;
}

export function TimezoneBanner() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Use the cached stats query to get the user's stored timezone
  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ['stats'],
    queryFn: () => api<StatsResponse>('/api/stats'),
    // Avoid refetching just for the timezone
    staleTime: Infinity,
  });

  const deviceTimezone = React.useMemo(() => {
    if (typeof window === 'undefined') return 'UTC';
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);

  const userTimezone = data?.userTimezone || 'UTC';
  const hasMismatch = deviceTimezone !== userTimezone;

  const updateTimezoneMutation = useMutation({
    mutationFn: async () => {
      // 1. Update the user's timezone in the DB
      await api('/api/settings/timezone', {
        method: 'POST',
        body: JSON.stringify({ timezone: deviceTimezone }),
      });
      // 2. Trigger a replan across all goals to recalculate times in the new timezone
      await api('/api/schedule/replan', { method: 'POST' });
    },
    onSuccess: () => {
      toast.success(`Schedule timezone updated to ${deviceTimezone} and replanned!`);
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal'] });
    },
    onError: (err: Error) => {
      toast.error(`Failed to update timezone: ${err.message}`);
    },
  } as any); // cast to any to handle React Query v5 mutation fn type compatibility if needed

  // Load dismissed state from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDismissed = localStorage.getItem(`tz-dismiss-${deviceTimezone}`);
      if (isDismissed) {
        setDismissed(true);
      }
    }
  }, [deviceTimezone]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`tz-dismiss-${deviceTimezone}`, 'true');
    }
  };

  if (!mounted || isLoading || !data) return null;
  if (!hasMismatch || dismissed) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Globe className="mt-0.5 h-4 w-4 text-amber-500 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-amber-500">
              Timezone Mismatch Detected
            </p>
            <p className="text-[11px] text-muted-foreground leading-normal">
              Your schedule is configured in <span className="font-semibold text-foreground">{userTimezone}</span>, but your device is in <span className="font-semibold text-foreground">{deviceTimezone}</span>.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-amber-500/30 hover:bg-amber-500/20 hover:text-amber-500 font-medium gap-1.5"
            onClick={() => updateTimezoneMutation.mutate()}
            disabled={updateTimezoneMutation.isPending}
          >
            {updateTimezoneMutation.isPending ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Globe className="h-3 w-3" />
            )}
            Update schedule to {deviceTimezone}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
