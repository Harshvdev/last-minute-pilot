'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// Lightweight CSS-only confetti burst. Mounts briefly when `trigger` increments,
// then unmounts after the animation finishes. No external deps, no canvas.
// Respects prefers-reduced-motion (renders nothing).

interface ConfettiBurstProps {
  // Increment this number to fire a burst. The component watches this value
  // and only bursts when it changes.
  trigger: number;
  // Optional message to show in the center.
  message?: string;
}

const COLORS = [
  'var(--primary)',
  'var(--success)',
  'var(--warning)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
];

const PARTICLE_COUNT = 24;

export function ConfettiBurst({ trigger, message }: ConfettiBurstProps) {
  const [active, setActive] = React.useState(false);
  const [burstId, setBurstId] = React.useState(0);
  const prefersReducedMotion = React.useRef(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      prefersReducedMotion.current = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;
    }
  }, []);

  React.useEffect(() => {
    if (trigger === 0) return; // skip initial mount
    if (prefersReducedMotion.current) return;
    setActive(true);
    setBurstId((n) => n + 1);
    const t = window.setTimeout(() => setActive(false), 1800);
    return () => window.clearTimeout(t);
  }, [trigger]);

  if (!active) return null;

  // Pre-compute particle positions using a deterministic PRNG seeded by burstId
  // so each burst looks slightly different but is stable across re-renders.
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const seed = (burstId * 1000 + i) % 997;
    const angle = (i / PARTICLE_COUNT) * 360 + (seed % 30);
    const distance = 80 + (seed % 80);
    const x = Math.cos((angle * Math.PI) / 180) * distance;
    const y = Math.sin((angle * Math.PI) / 180) * distance;
    const color = COLORS[i % COLORS.length];
    const size = 6 + (seed % 6);
    const delay = (i % 5) * 30;
    const rotation = seed * 7;
    return { x, y, color, size, delay, rotation, id: `${burstId}-${i}` };
  });

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      aria-hidden
    >
      {/* Center message */}
      {message && (
        <div
          key={`msg-${burstId}`}
          className="animate-pop-in absolute rounded-full bg-success px-4 py-2 text-sm font-semibold text-success-foreground shadow-lg"
        >
          {message}
        </div>
      )}
      {/* Particles */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute h-2 w-2 animate-confetti-burst"
          style={
            {
              '--confetti-x': `${p.x}px`,
              '--confetti-y': `${p.y}px`,
              '--confetti-rotate': `${p.rotation}deg`,
              '--confetti-color': p.color,
              width: `${p.size}px`,
              height: `${p.size * 0.6}px`,
              backgroundColor: p.color,
              borderRadius: '1px',
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
