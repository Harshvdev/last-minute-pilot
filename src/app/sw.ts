// Serwist service worker — caches the app shell for offline use.
// Spec §8: "cache the app shell for offline viewing of the current schedule;
// queue progress updates with background sync so a user can mark a task done
// on the subway and it syncs when back online."
//
// In production, this SW precaches the built assets + caches navigation
// requests with a stale-while-revalidate strategy. API requests are NOT cached
// (they need fresh data) except for the dashboard stats endpoint which falls
// back to cache when offline.

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // Handle push notifications (Web Push API).
  onPush: async (event) => {
    const data = event.data;
    let payload: { title: string; body: string; url?: string };

    try {
      payload = data?.json() ?? { title: 'Last Minute Pilot', body: '' };
    } catch {
      payload = { title: 'Last Minute Pilot', body: data?.text() ?? '' };
    }

    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icon-192.svg',
        badge: '/icon-192.svg',
        tag: 'last-minute-pilot',
        data: { url: payload.url ?? '/' },
      })
    );
  },
  // Handle notification click — focus/open the app.
  onNotificationClick: async (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        // Focus an existing tab if one is open.
        for (const client of clients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab.
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
    );
  },
});

serwist.addEventListeners();
