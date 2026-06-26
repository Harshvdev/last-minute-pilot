'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Target,
  CalendarDays,
  Activity,
  Settings,
  Plane,
  Menu,
  X,
  Code,
  Search,
  BarChart3,
  LogOut,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { CommandPalette } from '@/components/command-palette';
import { ShortcutsHelp } from '@/components/shortcuts-help';
import { NotificationsBell } from '@/components/notifications-bell';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: "Today's focus and risk summary",
  },
  {
    href: '/goals',
    label: 'Goals',
    icon: Target,
    description: 'All active and completed goals',
  },
  {
    href: '/schedule',
    label: 'Schedule',
    icon: CalendarDays,
    description: 'Today and this week at a glance',
  },
  {
    href: '/pulse',
    label: 'Pulse',
    icon: Activity,
    description: 'Risk assessments and replan log',
  },
  {
    href: '/insights',
    label: 'Insights',
    icon: BarChart3,
    description: 'Productivity trends and analytics',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    description: 'Preferences and defaults',
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
            />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Plane className="h-[1.05rem] w-[1.05rem] -rotate-45" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">
          Last Minute Pilot
        </span>
        <span className="text-[0.6875rem] text-muted-foreground">
          Deadline copilot
        </span>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the mobile sheet whenever the route changes
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Hide the mobile bottom nav on /focus for a distraction-free experience.
  // Also remove the pb-24 bottom padding so the timer can center vertically.
  const isFocusMode = pathname === '/focus';

  useKeyboardShortcuts({
    onOpenPalette: () => setPaletteOpen(true),
    onToggleHelp: () => setHelpOpen((s) => !s),
    onNewGoal: () => {
      window.location.href = '/goals/new';
    },
  });

  return (
    <div className="relative min-h-screen flex flex-col">
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 lg:hidden border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 pt-safe">
        <div className="flex h-14 items-center justify-between px-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="px-5 pt-5 pb-3 text-left">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="px-3 pb-6 flex flex-col h-[calc(100vh-80px)] justify-between">
                <div>
                  <NavList onNavigate={() => setMobileOpen(false)} />
                </div>
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  >
                    <LogOut className="h-[1.15rem] w-[1.15rem] shrink-0" />
                    Sign out
                  </Button>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs font-medium text-foreground">
                      Stay on track
                    </p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                      Risk is recalculated whenever you log progress. The
                      scheduler adapts to your remaining free time.
                    </p>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Brand />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
            >
              <Search className="h-[1.05rem] w-[1.05rem]" />
            </Button>
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex flex-1 w-full">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="flex h-16 items-center px-5 border-b border-sidebar-border">
            <Brand />
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col justify-between">
            <div className="space-y-4">
              <NavList />
              <div className="px-3">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </p>
                <div className="mt-2">
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/20 gap-1.5"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    Copilot online
                  </Badge>
                </div>
              </div>
            </div>
            <div className="py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              >
                <LogOut className="h-[1.15rem] w-[1.15rem] shrink-0" />
                Sign out
              </Button>
            </div>
          </div>
          <div className="border-t border-sidebar-border p-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[0.6875rem] font-medium text-foreground">
                Deterministic engine
              </p>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                Scheduling &amp; risk detection run without the LLM. The model
                only writes the words you read.
              </p>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Desktop top bar */}
          <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center justify-between gap-4 border-b border-border bg-background/85 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <CurrentPageTitle />
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaletteOpen(true)}
                className="gap-2 text-muted-foreground"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Search</span>
                <kbd className="ml-1 hidden shrink-0 select-none items-center gap-0.5 rounded border border-border bg-muted px-1 py-0.5 text-[0.625rem] font-medium text-muted-foreground md:inline-flex">
                  ⌘K
                </kbd>
              </Button>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden xl:inline-flex"
                aria-label="View source on GitHub"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Code className="h-4 w-4" />
                  Source
                </Button>
              </a>
              <NotificationsBell />
              <ThemeToggle />
            </div>
          </header>

          <main className={cn(
            'flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 lg:pb-8',
            isFocusMode ? 'pb-8' : 'pb-24'
          )}>
            <div className="mx-auto w-full max-w-6xl animate-fade-in-up">
              {children}
            </div>
          </main>

          <Footer />
        </div>
      </div>

      {/* Mobile bottom navigation — thumb-friendly (hidden on /focus for immersion) */}
      {!isFocusMode && <MobileBottomNav />}
    </div>
  );
}

function CurrentPageTitle() {
  const pathname = usePathname();
  const current =
    NAV_ITEMS.find((i) =>
      i.href === '/' ? pathname === '/' : pathname.startsWith(i.href)
    ) ?? NAV_ITEMS[0];

  return (
    <div className="flex flex-col">
      <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
        Last Minute Pilot
      </span>
      <h1 className="text-base font-semibold tracking-tight text-foreground">
        {current.label}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          · {current.description}
        </span>
      </h1>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6 lg:flex-row lg:items-center lg:px-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Plane className="h-3.5 w-3.5 text-primary" />
          <span>
            Last Minute Pilot — plan, monitor, replan.
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Deterministic scheduling
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">AI-assisted explanations</span>
        </div>
      </div>
    </footer>
  );
}

// Unused import guard — kept X icon for potential close buttons.
void X;
