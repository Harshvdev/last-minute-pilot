'use client';

import * as React from 'react';
import { SessionProvider } from 'next-auth/react';

// Wraps the app to provide the NextAuth session to client components.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
