// Next.js Proxy (formerly middleware) — protects all routes except auth + static assets.
// Unauthenticated users are redirected to /auth/signin.
//
// In local dev with the Credentials fallback provider, we skip the check so
// the app is usable without OAuth setup. The dev user is created on-demand
// when the API routes call requireUser().
//
// Note: Next.js 16.2 renamed `middleware.ts` to `proxy.ts` and requires the
// export to be named `proxy` (or default).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // In dev mode without OAuth configured, skip auth entirely.
  // The API routes use the Credentials provider which auto-creates a dev user.
  const isDevMode =
    !process.env.GOOGLE_CLIENT_ID && !process.env.GITHUB_CLIENT_ID;
  if (isDevMode) {
    return NextResponse.next();
  }

  // In production, check for a valid JWT session.
  const token = await getToken({ req });
  if (!token) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Protect everything except:
  // - /api/auth/* (NextAuth handlers)
  // - /auth/* (sign-in page)
  // - /_next/* (Next.js internals)
  // - static assets
  matcher: [
    '/((?!api/auth|auth|_next/static|_next/image|favicon.ico|icon-192.svg|icon-512.svg|logo.svg|manifest.webmanifest|robots.txt).*)',
  ],
};
