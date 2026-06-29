// Server-side auth helpers for API routes.
// Use `requireUser()` in any API route that needs an authenticated user.
// It returns the user id, or returns a 401 response if not authenticated.
//
// In dev mode (no OAuth configured), auto-creates + returns a dev user
// so the app is usable without setting up Google/GitHub OAuth.

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

const DEV_USER_EMAIL = 'dev@last-minute-pilot.local';

/**
 * Get the current authenticated user's session.
 * Returns null if not authenticated.
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * Get the current user's id, or null if not authenticated.
 * In dev mode (no OAuth), auto-creates a dev user.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  if (session?.user?.id) {
    return session.user.id;
  }

  // Dev fallback: if no OAuth providers are configured, auto-create a dev user.
  // This lets you test the multi-user schema locally without OAuth setup.
  const isDevMode =
    !process.env.GOOGLE_CLIENT_ID && !process.env.GITHUB_CLIENT_ID;
  if (isDevMode) {
    let user = await db.user.findUnique({ where: { email: DEV_USER_EMAIL } });
    if (!user) {
      user = await db.user.create({
        data: { email: DEV_USER_EMAIL, name: 'Dev User' },
      });
    }
    return user.id;
  }

  return null;
}

/**
 * Require an authenticated user. Returns the user id on success, or a 401
 * NextResponse on failure.
 *
 * Usage in an API route:
 *   const userIdOrResponse = await requireUser();
 *   if (userIdOrResponse instanceof NextResponse) return userIdOrResponse;
 *   const userId: string = userIdOrResponse;
 */
export async function requireUser(): Promise<string | NextResponse> {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  return userId;
}

/**
 * Type guard: check if a value is a NextResponse (i.e. an error response
 * from requireUser()).
 */
export function isErrorResponse(
  value: string | NextResponse
): value is NextResponse {
  return value instanceof NextResponse;
}

/**
 * Fetch the user's timezone from the database.
 * Defaults to 'UTC' if the user is not found or has no timezone set.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return user?.timezone || 'UTC';
}
