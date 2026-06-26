'use client';

// Global keyboard shortcuts for Last Minute Pilot.
// Single-character "g" prefix navigation (Gmail-style) + Cmd/Ctrl+K palette.
// Press "?" to show the help overlay.

import * as React from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutSpec {
  keys: string; // display, e.g. "g d"
  description: string;
  action: () => void;
  // internal sequence: ['g', 'd']
  sequence: string[];
}

export interface ShortcutEntry {
  keys: string;
  description: string;
  category: 'navigation' | 'actions';
}

export function useKeyboardShortcuts(opts?: {
  onOpenPalette?: () => void;
  onToggleHelp?: () => void;
  onNewGoal?: () => void;
}) {
  const router = useRouter();
  const [showHelp, setShowHelp] = React.useState(false);
  const bufferRef = React.useRef<string[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const specs: ShortcutSpec[] = React.useMemo(
    () => [
      {
        keys: 'g d',
        description: 'Go to Dashboard',
        sequence: ['g', 'd'],
        action: () => router.push('/'),
      },
      {
        keys: 'g g',
        description: 'Go to Goals',
        sequence: ['g', 'g'],
        action: () => router.push('/goals'),
      },
      {
        keys: 'g s',
        description: 'Go to Schedule',
        sequence: ['g', 's'],
        action: () => router.push('/schedule'),
      },
      {
        keys: 'g p',
        description: 'Go to Pulse',
        sequence: ['g', 'p'],
        action: () => router.push('/pulse'),
      },
      {
        keys: 'g i',
        description: 'Go to Insights',
        sequence: ['g', 'i'],
        action: () => router.push('/insights'),
      },
      {
        keys: 'g c', // 'c' for config to avoid clashing with palette 'k'
        description: 'Go to Settings',
        sequence: ['g', 'c'],
        action: () => router.push('/settings'),
      },
      {
        keys: 'n',
        description: 'New goal',
        sequence: ['n'],
        action: () => router.push('/goals/new'),
      },
      {
        keys: 'f',
        description: 'Focus mode',
        sequence: ['f'],
        action: () => router.push('/focus'),
      },
    ],
    [router]
  );

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Never intercept when typing in an input/textarea/contenteditable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'combobox' ||
          target.getAttribute('role') === 'textbox')
      ) {
        return;
      }

      // Cmd/Ctrl+K → palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        opts?.onOpenPalette?.();
        return;
      }

      // ? → help
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowHelp((s) => !s);
        opts?.onToggleHelp?.();
        return;
      }

      // Escape closes help
      if (e.key === 'Escape') {
        if (showHelp) setShowHelp(false);
        bufferRef.current = [];
        return;
      }

      // "g" prefix navigation
      const key = e.key.toLowerCase();
      if (!/^[a-z?]$/.test(key)) return;

      bufferRef.current.push(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        bufferRef.current = [];
      }, 700);

      // Match against specs (max 2-key sequences)
      const buf = bufferRef.current.slice(-2);
      for (const spec of specs) {
        if (
          buf.length === spec.sequence.length &&
          spec.sequence.every((k, i) => k === buf[i])
        ) {
          e.preventDefault();
          spec.action();
          bufferRef.current = [];
          return;
        }
      }
      // Single-key 'n' for new goal
      if (buf.length === 1 && buf[0] === 'n') {
        e.preventDefault();
        opts?.onNewGoal?.();
        bufferRef.current = [];
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [specs, opts, showHelp]);

  return { showHelp, setShowHelp };
}

export const SHORTCUT_DOCS: ShortcutEntry[] = [
  { keys: '⌘K', description: 'Open command palette', category: 'actions' },
  { keys: '?', description: 'Show/hide this help', category: 'actions' },
  { keys: 'N', description: 'Create a new goal', category: 'actions' },
  { keys: 'F', description: 'Focus mode (one task at a time)', category: 'actions' },
  { keys: 'G D', description: 'Dashboard', category: 'navigation' },
  { keys: 'G G', description: 'Goals', category: 'navigation' },
  { keys: 'G S', description: 'Schedule', category: 'navigation' },
  { keys: 'G P', description: 'Pulse', category: 'navigation' },
  { keys: 'G I', description: 'Insights', category: 'navigation' },
  { keys: 'G C', description: 'Settings', category: 'navigation' },
  { keys: 'Esc', description: 'Close dialog / clear buffer', category: 'actions' },
];
