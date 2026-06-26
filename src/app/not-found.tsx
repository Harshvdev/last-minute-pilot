import Link from 'next/link';
import { Plane, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Plane className="h-8 w-8 -rotate-45" />
      </div>
      <p className="mt-6 text-5xl font-semibold tracking-tight tabular-nums">404</p>
      <h1 className="mt-2 text-lg font-semibold tracking-tight">
        This page drifted off course
      </h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
        The page you were looking for doesn&apos;t exist, or the copilot
        couldn&apos;t find a route to it.
      </p>
      <Button asChild className="mt-6 gap-2">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
