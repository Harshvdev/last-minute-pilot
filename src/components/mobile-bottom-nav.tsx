'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Target, CalendarDays, Activity, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

// Mobile bottom navigation — thumb-friendly, fixed to bottom.
// Shows 4 primary destinations + a center "create" FAB.
// Hidden on desktop (lg breakpoint) where the sidebar is visible.

const ITEMS = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/pulse', label: 'Pulse', icon: Activity },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80 pb-safe"
    >
      <div className="relative mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {ITEMS.slice(0, 2).map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(item.href)}
          />
        ))}

        {/* Center create FAB */}
        <Link
          href="/goals/new"
          aria-label="Create a new goal"
          className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-5 w-5" />
        </Link>

        {ITEMS.slice(2).map((item) => (
          <NavButton
            key={item.href}
            item={item}
            active={isActive(item.href)}
          />
        ))}
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
}: {
  item: (typeof ITEMS)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon
        className={cn(
          'h-5 w-5 transition-transform',
          active && 'scale-110'
        )}
      />
      <span className="text-[0.625rem] font-medium">{item.label}</span>
      {active && (
        <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary" />
      )}
    </Link>
  );
}
