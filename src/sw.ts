/// <reference lib="webworker" />
// Prefa service worker (vite-plugin-pwa `injectManifest`).
// Workbox radi precache + SPA navigation fallback; mi dodajemo `push` i
// `notificationclick` handler-e za Web Push obaveštenja ("na potezu si", pozivi…).
import type { PrecacheEntry } from 'workbox-precaching';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import type { RouteMatchCallbackOptions } from 'workbox-core';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

// Čekamo eksplicitni SKIP_WAITING (šalje ga updateServiceWorker(true) iz UI-ja),
// da bi "nova verzija dostupna" prompt mogao da radi umesto tihe zamene.
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigacije → keširani index.html (React Router preuzima klijentski).
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
  }),
);

// Cross-origin fontovi/slike: stale-while-revalidate.
registerRoute(
  ({ url, request }: RouteMatchCallbackOptions) =>
    url.origin !== self.location.origin && (request.destination === 'font' || request.destination === 'image'),
  new StaleWhileRevalidate({ cacheName: 'cross-origin-assets' }),
);

// ── Web Push ────────────────────────────────────────────────────────────────
interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
}

// Ikone se razrešavaju u odnosu na scope (radi i pod /preferans/ base-om na GH Pages).
const ICON_URL = new URL('pwa-192x192.png', self.registration.scope).href;
const BADGE_URL = new URL('pwa-64x64.png', self.registration.scope).href;

self.addEventListener('push', (event) => {
  let payload: PushPayload;
  try {
    payload = event.data ? (event.data.json() as PushPayload) : { title: 'Prefa' };
  } catch {
    payload = { title: 'Prefa', body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body ?? '',
      icon: ICON_URL,
      badge: BADGE_URL,
      tag: payload.tag,
      // renotify traži da tag postoji; kada nije zadat, ne šaljemo ga.
      ...(payload.tag ? { renotify: payload.renotify ?? true } : {}),
      data: { url: payload.url ?? '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | undefined;
  // Skini vodeće kose crte da putanja bude relativna na scope (/preferans/), ne na koren.
  const targetPath = (data?.url ?? '').replace(/^\/+/, '');
  const targetUrl = new URL(targetPath, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          if (client.url !== targetUrl && 'navigate' in client) {
            await client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
