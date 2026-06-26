'use client';

import * as React from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Star } from 'lucide-react';

import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Priority star toggle — click to cycle through priority levels 0 → 1 → 2 → 0.
// Renders as a star icon that fills + colors based on level.
export function PriorityStar({
  goalId,
  priority,
  size = 'sm',
}: {
  goalId: string;
  priority: number;
  size?: 'sm' | 'md';
}) {
  const qc = useQueryClient();
  const level = priority >= 2 ? 2 : priority >= 1 ? 1 : 0;

  const mutation = useMutation({
    mutationFn: (newPriority: number) =>
      api(`/api/goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: newPriority }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cycle = () => {
    const next = level === 0 ? 1 : level === 1 ? 2 : 0;
    mutation.mutate(next);
  };

  const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'shrink-0 p-0.5',
        size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
        level === 0 && 'text-muted-foreground/50 hover:text-warning',
        level === 1 && 'text-warning',
        level === 2 && 'text-warning',
        'hover:bg-transparent'
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cycle();
      }}
      disabled={mutation.isPending}
      aria-label={`Priority ${level === 0 ? 'none' : level === 1 ? 'normal' : 'high'}. Click to change.`}
      title={`Priority: ${level === 0 ? 'None' : level === 1 ? 'Normal' : 'High'}`}
    >
      <Star
        className={cn(sizeClass, level > 0 && 'fill-current')}
      />
    </Button>
  );
}
