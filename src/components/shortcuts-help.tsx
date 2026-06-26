'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SHORTCUT_DOCS, type ShortcutEntry } from '@/hooks/use-keyboard-shortcuts';

export function ShortcutsHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const nav = SHORTCUT_DOCS.filter((s) => s.category === 'navigation');
  const actions = SHORTCUT_DOCS.filter((s) => s.category === 'actions');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-lg font-semibold tracking-tight">
          Keyboard shortcuts
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Power-user navigation. Works anywhere outside text inputs.
        </DialogDescription>
        <div className="mt-2 grid grid-cols-1 gap-5">
          <ShortcutGroup title="Navigation" entries={nav} />
          <ShortcutGroup title="Actions" entries={actions} />
        </div>
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          The <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[0.625rem]">g</kbd>{' '}
          prefix waits for a second key (700ms). Press{' '}
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[0.625rem]">Esc</kbd>{' '}
          to cancel.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroup({
  title,
  entries,
}: {
  title: string;
  entries: ShortcutEntry[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {entries.map((s) => (
          <li key={s.keys} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{s.description}</span>
            <kbd className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums text-foreground">
              {s.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}
