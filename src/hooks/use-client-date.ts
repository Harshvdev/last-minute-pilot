'use client';

import * as React from 'react';

// Returns a Date object that is only set on the client (after hydration).
// On the server and during the first client render, returns null.
// This prevents hydration mismatches when components render time-sensitive
// content (greetings, "today" labels, etc.) that differs between server
// and client.
//
// Usage:
//   const now = useClientDate();
//   return <h1>{now ? greeting(now) : 'Hello'}</h1>;

export function useClientDate(): Date | null {
  const [date, setDate] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setDate(new Date());
    // Update every minute so "in 5 minutes" style labels stay fresh.
    const id = window.setInterval(() => setDate(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return date;
}
