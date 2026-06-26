// Shared availability editor — used in goal detail and onboarding.
// Lets the user add recurring weekly windows or one-off date windows when
// they can actually work on this goal.

'use client';

import { Plus, Trash2, CalendarDays, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DAYS_OF_WEEK } from '@/lib/format';

export interface AvailabilityItem {
  id?: string;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  specificDate: string | null; // ISO datetime or null
}

export function AvailabilityEditor({
  items,
  onChange,
}: {
  items: AvailabilityItem[];
  onChange: (items: AvailabilityItem[]) => void;
}) {
  const addRecurring = () => {
    onChange([
      ...items,
      {
        dayOfWeek: 1,
        startTime: '18:00',
        endTime: '20:00',
        specificDate: null,
      },
    ]);
  };
  const addOneOff = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(18, 0, 0, 0);
    onChange([
      ...items,
      {
        dayOfWeek: null,
        startTime: '18:00',
        endTime: '20:00',
        specificDate: tomorrow.toISOString(),
      },
    ]);
  };
  const update = (idx: number, patch: Partial<AvailabilityItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          No availability set. Add a weekly window or a one-off date so the
          scheduler knows when you can actually work.
        </div>
      )}

      <ul className="space-y-2">
        {items.map((item, idx) => {
          const isRecurring = item.specificDate === null;
          return (
            <li
              key={idx}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-2">
                {isRecurring ? (
                  <Repeat className="h-4 w-4 text-primary" />
                ) : (
                  <CalendarDays className="h-4 w-4 text-primary" />
                )}
                <Switch
                  checked={isRecurring}
                  onCheckedChange={(checked) =>
                    update(idx, {
                      dayOfWeek: checked ? 1 : null,
                      specificDate: checked
                        ? null
                        : new Date(Date.now() + 86400000).toISOString(),
                    })
                  }
                  aria-label="Toggle recurring vs one-off"
                />
                <span className="text-xs text-muted-foreground">
                  {isRecurring ? 'Weekly' : 'One-off'}
                </span>
              </div>

              {isRecurring ? (
                <Select
                  value={String(item.dayOfWeek ?? 1)}
                  onValueChange={(v) => update(idx, { dayOfWeek: Number(v) })}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="date"
                  value={
                    item.specificDate
                      ? new Date(item.specificDate).toISOString().slice(0, 10)
                      : ''
                  }
                  onChange={(e) => {
                    const date = new Date(e.target.value + 'T00:00:00');
                    update(idx, { specificDate: date.toISOString() });
                  }}
                  className="h-9 w-full sm:w-[160px]"
                />
              )}

              <div className="flex items-center gap-1.5">
                <Input
                  type="time"
                  value={item.startTime ?? '18:00'}
                  onChange={(e) => update(idx, { startTime: e.target.value })}
                  className="h-9 w-full sm:w-[110px]"
                  aria-label="Start time"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={item.endTime ?? '20:00'}
                  onChange={(e) => update(idx, { endTime: e.target.value })}
                  className="h-9 w-full sm:w-[110px]"
                  aria-label="End time"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(idx)}
                aria-label="Remove availability"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRecurring} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add weekly window
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={addOneOff} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add one-off date
        </Button>
      </div>
    </div>
  );
}
