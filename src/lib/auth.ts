// NextAuth configuration — Google + GitHub OAuth providers.
// Multi-user: every user gets their own scoped goals/tasks/schedule.
//
// In production, set these env vars (see .env):
//   NEXTAUTH_SECRET, NEXTAUTH_URL
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
//
// The Google provider requests Calendar scopes so we can read busy slots and
// write planned time blocks back to the user's real calendar.

import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { db } from '@/lib/db';

// Google OAuth scopes:
// - openid email profile: basic identity
// - https://www.googleapis.com/auth/calendar.events: read + write calendar events
//   (needed for the calendar sync feature in src/lib/calendar/sync.ts)
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
];

function hasGoogleCreds() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

function hasGitHubCreds() {
  return !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;
}

// Build the providers list dynamically. In local dev without OAuth creds,
// we fall back to a Credentials provider with a single dev user so the app
// is still usable for testing.
const providers: NextAuthOptions['providers'] = [];

if (hasGoogleCreds()) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES.join(' '),
          // offline access so we get a refresh_token for Calendar API calls
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  );
}

if (hasGitHubCreds()) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

// Dev fallback: if no OAuth providers are configured, use a Credentials
// provider with a single "dev" user. This lets you test the multi-user schema
// locally without setting up Google/GitHub OAuth.
if (providers.length === 0) {
  providers.push(
    CredentialsProvider({
      name: 'Dev User',
      credentials: {},
      async authorize() {
        // Auto-create/login a dev user
        const email = 'dev@last-minute-pilot.local';
        let user = await db.user.findUnique({ where: { email } });
        if (!user) {
          user = await db.user.create({
            data: { email, name: 'Dev User' },
          });
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'jwt', // JWT for serverless compatibility (Vercel)
  },
  providers,
  callbacks: {
    async jwt({ token, user, account }) {
      // On first sign-in, `user` and `account` are populated.
      // Persist the user id + google tokens in the JWT.
      if (user) {
        token.userId = user.id;
      }
      if (account?.access_token) {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleExpiresAt = account.expires_at
          ? account.expires_at * 1000
          : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose the user id + google tokens on the session object so API
      // routes can use them for DB queries + Calendar API calls.
      if (session.user) {
        session.user.id = token.userId as string;
      }
      session.googleAccessToken = token.googleAccessToken as string | undefined;
      session.googleRefreshToken = token.googleRefreshToken as string | undefined;
      session.googleExpiresAt = token.googleExpiresAt as number | undefined;
      return session;
    },
  },
  events: {
    // When a user signs in with Google, persist their OAuth tokens to the
    // User table so background jobs (calendar sync) can use them.
    async signIn(message) {
      if (message.account?.provider === 'google' && message.user?.id) {
        await db.user.update({
          where: { id: message.user.id },
          data: {
            googleAccessToken: message.account.access_token,
            googleRefreshToken: message.account.refresh_token,
            googleTokenExpiresAt: message.account.expires_at
              ? new Date(message.account.expires_at * 1000)
              : null,
          },
        });
      }
    },
  },
  pages: {
    // Custom sign-in page (defaults to NextAuth's built-in)
    signIn: '/auth/signin',
  },
};

// Augment the NextAuth types to include our custom session fields.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleExpiresAt?: number;
  }

  interface User {
    id: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleExpiresAt?: number;
  }
}
