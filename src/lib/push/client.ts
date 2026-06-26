'use client';

// Client-side Web Push helper.
// Call `subscribeToPush()` after the user grants permission.
// This registers the browser with the push service and sends the subscription
// to our server via /api/push/subscribe.

export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[push] Push notifications not supported in this browser');
    return false;
  }

  // 1. Request notification permission.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('[push] Notification permission denied');
    return false;
  }

  // 2. Wait for the service worker to be ready.
  const registration = await navigator.serviceWorker.ready;

  // 3. Subscribe to push using the VAPID public key.
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
    return false;
  }

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required — notifications must be visible
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // 4. Send the subscription to the server.
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    if (!response.ok) {
      console.error('[push] Failed to save subscription on server');
      return false;
    }

    return true;
  } catch (err) {
    console.error('[push] Failed to subscribe:', err);
    return false;
  }
}

/**
 * Convert a base64 VAPID public key to a Uint8Array (required by the Push API).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported + permission status.
 */
export function getPushStatus(): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
} {
  if (typeof window === 'undefined' || !('PushManager' in window)) {
    return { supported: false, permission: 'unsupported' };
  }
  return {
    supported: true,
    permission: Notification.permission,
  };
}
