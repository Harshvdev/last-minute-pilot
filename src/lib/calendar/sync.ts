// Google Calendar sync — read busy slots + write planned time blocks.
//
// This module integrates with the deterministic scheduler (fit-blocks.ts):
//   1. Before scheduling, fetch the user's Google Calendar events for the
//      scheduling window and mark those times as "busy" so the scheduler
//      doesn't double-book.
//   2. After scheduling, write the generated schedule_blocks back to the
//      user's Google Calendar as events, saving the google_event_id so we
//      can update/delete them later if the schedule changes.
//
// Requires Google OAuth with the calendar.events scope (configured in
// src/lib/auth.ts). Tokens are stored per-user in the User table.

import { google } from 'googleapis';
import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// OAuth2 client — uses the user's stored tokens (refreshed automatically)
// ---------------------------------------------------------------------------

function getOAuth2Client(userId: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/SECRET not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  );

  return {
    client: oauth2Client,
    userId,
  };
}

/**
 * Load the user's Google OAuth tokens from the database and set them on the
 * OAuth2 client. The client auto-refreshes expired access tokens using the
 * refresh token.
 */
async function getAuthenticatedClient(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleRefreshToken: true,
      googleTokenExpiresAt: true,
    },
  });

  if (!user || !user.googleAccessToken || !user.googleRefreshToken) {
    throw new Error('User has not connected Google Calendar');
  }

  const { client } = getOAuth2Client(userId);
  client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
    expiry_date: user.googleTokenExpiresAt?.getTime(),
  });

  return client;
}

// ---------------------------------------------------------------------------
// Read busy slots from Google Calendar
// ---------------------------------------------------------------------------

export interface BusySlot {
  start: Date;
  end: Date;
  summary?: string;
}

/**
 * Fetch the user's Google Calendar events between `start` and `end`.
 * Returns an array of busy slots that the scheduler should avoid.
 *
 * Called by the scheduler (fit-blocks.ts) before bin-packing tasks into
 * availability windows.
 */
export async function fetchBusySlots(
  userId: string,
  start: Date,
  end: Date
): Promise<BusySlot[]> {
  try {
    const client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items ?? [];
    return events
      .filter((event) => {
        // Skip all-day events (they don't block specific time slots)
        if (event.start?.date && !event.start?.dateTime) return false;
        // Skip cancelled events
        if (event.status === 'cancelled') return false;
        // Skip events the user marked as "free" (transparent)
        if (event.transparency === 'transparent') return false;
        return true;
      })
      .map((event) => ({
        start: new Date(event.start?.dateTime ?? event.start?.date ?? ''),
        end: new Date(event.end?.dateTime ?? event.end?.date ?? ''),
        summary: event.summary ?? undefined,
      }))
      .filter((slot) => !isNaN(slot.start.getTime()) && !isNaN(slot.end.getTime()));
  } catch (err) {
    // If Calendar API fails (token expired, no access, etc.), log and return
    // empty — the scheduler will still work using just the user's availability
    // windows. Better to schedule without calendar data than to fail entirely.
    console.warn(
      `[calendar] Failed to fetch busy slots for user ${userId}:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Write schedule blocks back to Google Calendar
// ---------------------------------------------------------------------------

/**
 * Create a Google Calendar event for a schedule block.
 * Saves the google_event_id on the ScheduleBlock for future updates/deletes.
 */
export async function createCalendarEvent(
  userId: string,
  blockId: string,
  taskTitle: string,
  goalTitle: string,
  startAt: Date,
  endAt: Date
): Promise<string | null> {
  try {
    const client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `${taskTitle} · ${goalTitle}`,
        description: `Scheduled by Last Minute Pilot — your AI deadline copilot.\n\nGoal: ${goalTitle}\nTask: ${taskTitle}`,
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() },
        // Mark as "busy" so other scheduling tools respect this block
        transparency: 'opaque',
        // Use a distinct color to distinguish from user-created events
        colorId: '10', // green — "Last Minute Pilot" blocks
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 5 }],
        },
        // Extended properties for idempotency + future sync
        extendedProperties: {
          private: {
            'last-minute-pilot': 'true',
            'block-id': blockId,
          },
        },
      },
    });

    const eventId = event.data.id ?? null;
    if (eventId) {
      // Save the google_event_id so we can update/delete later.
      await db.scheduleBlock.update({
        where: { id: blockId },
        data: { googleEventId: eventId },
      });
    }
    return eventId;
  } catch (err) {
    console.warn(
      `[calendar] Failed to create event for block ${blockId}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Update an existing Google Calendar event (e.g. when a schedule block is
 * rescheduled). Falls back to create if the event doesn't exist.
 */
export async function updateCalendarEvent(
  userId: string,
  blockId: string,
  googleEventId: string | null,
  taskTitle: string,
  goalTitle: string,
  startAt: Date,
  endAt: Date
): Promise<string | null> {
  if (!googleEventId) {
    return createCalendarEvent(userId, blockId, taskTitle, goalTitle, startAt, endAt);
  }

  try {
    const client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    await calendar.events.update({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: {
        summary: `${taskTitle} · ${goalTitle}`,
        description: `Scheduled by Last Minute Pilot — your AI deadline copilot.\n\nGoal: ${goalTitle}\nTask: ${taskTitle}`,
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() },
      },
    });
    return googleEventId;
  } catch (err) {
    console.warn(
      `[calendar] Failed to update event ${googleEventId}:`,
      err instanceof Error ? err.message : err
    );
    // If update fails (event deleted on calendar side), try to create a new one.
    return createCalendarEvent(userId, blockId, taskTitle, goalTitle, startAt, endAt);
  }
}

/**
 * Delete a Google Calendar event when a schedule block is removed.
 */
export async function deleteCalendarEvent(
  userId: string,
  googleEventId: string
): Promise<boolean> {
  try {
    const client = await getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
    return true;
  } catch (err) {
    console.warn(
      `[calendar] Failed to delete event ${googleEventId}:`,
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

/**
 * Check if the user has connected their Google Calendar (has valid tokens).
 */
export async function hasCalendarConnected(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { googleAccessToken: true, googleRefreshToken: true },
  });
  return !!(user?.googleAccessToken && user?.googleRefreshToken);
}
