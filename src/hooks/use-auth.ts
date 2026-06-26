'use client';

import { useSession } from 'next-auth/react';

// Re-export useSession for client components that need the auth state.
// Usage:
//   const { data: session, status } = useAuth();
//   if (status === 'loading') return <Skeleton />;
//   if (!session) return <SignInPrompt />;

export function useAuth() {
  return useSession();
}
