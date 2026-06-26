// Web Push — server-side helper to send push notifications.
// Uses the web-push library with VAPID keys (Voluntary Application Server
// Identification). VAPID keys are generated once and stored in env vars.
//
// Generate keys: `bun run generate-vapid-keys` (one-time setup)
// Or: `npx web-push generate-vapid-keys`
//
// Then set in .env:
//   VAPID_PUBLIC_KEY="..."
//   VAPID_PRIVATE_KEY="..."
//   VAPID_SUBJECT="mailto:you@example.com"

import webPush from 'web-push';
import { db } from '@/lib/db';

// Configure web-push with VAPID details (once per process).
let configured = false;
function configure() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:dev@example.com';
  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set. Run `bun run generate-vapid-keys` to generate them.'
    );
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a push notification to all of a user's subscribed devices.
 * Silently skips if the user has no subscriptions or push is not configured.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    configure();
  } catch (err) {
    // VAPID not configured — skip silently (common in dev).
    console.warn('[push] Skipping — VAPID not configured:', err instanceof Error ? err.message : err);
    return;
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const payloadString = JSON.stringify(payload);

  // Send to all subscriptions in parallel. If any fails with a 410/404,
  // delete that subscription (the user has unsubscribed or changed devices).
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payloadString
        );
      } catch (err: unknown) {
        // 410 = Gone, 404 = Not Found — subscription is no longer valid.
        const statusCode =
          (err as { statusCode?: number }).statusCode ?? 0;
        if (statusCode === 410 || statusCode === 404) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.warn(
            `[push] Failed to send to ${sub.endpoint}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    })
  );
}

/**
 * Send a push notification when a schedule block is starting.
 * Called by the cron job or when the user opens the app.
 */
export async function notifyBlockStarting(
  userId: string,
  taskTitle: string,
  goalTitle: string,
  startAt: Date
): Promise<void> {
  await sendPushNotification(userId, {
    title: 'Time to focus',
    body: `${taskTitle} · ${goalTitle} starts now`,
    url: '/focus',
  });
}

/**
 * Send a push notification when a goal's risk level escalates.
 * Only fires when risk actually changes (not on every assessment).
 */
export async function notifyRiskEscalation(
  userId: string,
  goalTitle: string,
  riskLevel: string,
  suggestedAction?: string | null
): Promise<void> {
  const body = suggestedAction
    ? `${goalTitle} is now ${riskLevel}. ${suggestedAction}`
    : `${goalTitle} is now ${riskLevel} risk. Check your schedule.`;
  await sendPushNotification(userId, {
    title: 'Risk escalation',
    body,
    url: '/pulse',
  });
}

/**
 * Send an end-of-day summary push if the user is behind.
 */
export async function notifyEndOfDaySummary(
  userId: string,
  tasksCompletedToday: number,
  atRiskCount: number
): Promise<void> {
  if (atRiskCount > 0) {
    await sendPushNotification(userId, {
      title: 'Daily summary',
      body: `${tasksCompletedToday} tasks done today. ${atRiskCount} goal${atRiskCount === 1 ? '' : 's'} need attention.`,
      url: '/pulse',
    });
  }
}
