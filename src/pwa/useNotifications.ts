// Web Push pretplata iz UI-ja: dozvola → pushManager.subscribe → čuvanje na serveru.
// Napomena (iOS): dozvola se može tražiti SAMO iz instaliranog PWA-a; u običnom Safari
// tabu Notification.requestPermission() ne radi (zato Podešavanja nude „dodaj na ekran").
import { useCallback, useEffect, useState } from 'react';
import { api } from '@net/api';
import { hasOnlineEnv } from '@net/config';
import { VAPID_PUBLIC_KEY, vapidPublicKeyToUint8Array } from './pwaConfig';

export type PermissionState = 'default' | 'granted' | 'denied';

/** Race protiv timeout-a — da subscribe/ready nikad ne ostave switch zauvek u „pending". */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

export interface NotificationsState {
  /** browser podržava SW + Push + Notification, i server je konfigurisan */
  supported: boolean;
  permission: PermissionState;
  /** ovaj uređaj je trenutno pretplaćen */
  isSubscribed: boolean;
  pending: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendLocalTest: () => Promise<void>;
}

function supportedNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    hasOnlineEnv() && // bez servera nema kome da se pošalje pretplata
    VAPID_PUBLIC_KEY.length > 0
  );
}

export function useNotifications(): NotificationsState {
  const supported = supportedNow();
  const [permission, setPermission] = useState<PermissionState>(
    supported ? (Notification.permission as PermissionState) : 'default',
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pročitaj postojeću pretplatu na mount → UI odmah odražava već-pretplaćen uređaj
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setEndpoint(existing?.endpoint ?? null);
      } catch {
        /* best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError('Ovaj uređaj ili browser ne podržava push obaveštenja.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm as PermissionState);
      if (perm === 'denied') {
        setError(
          'Obaveštenja su blokirana za ovaj sajt u browseru. Dozvoli ih (🔒/ⓘ pored adrese → „Obaveštenja" → „Dozvoli"), pa pokušaj ponovo.',
        );
        return;
      }
      if (perm !== 'granted') {
        setError('Prozor za dozvolu je zatvoren pre izbora. Klikni ponovo i izaberi „Dozvoli".');
        return;
      }

      const reg = await withTimeout(
        navigator.serviceWorker.ready,
        5000,
        'Service worker nije spreman — osveži stranicu.',
      );
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidPublicKeyToUint8Array(),
          }),
          10000,
          'Pretplata na push servis nije uspela (proveri internet / blokator).',
        ));

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? '';
      const auth = json.keys?.auth ?? '';
      if (!json.endpoint || !p256dh || !auth) throw new Error('Browser je vratio nepotpunu pretplatu.');

      try {
        await api.subscribePush({ endpoint: json.endpoint, keys: { p256dh, auth }, userAgent: navigator.userAgent });
      } catch (e) {
        // server nije prihvatio → poništi i browser pretplatu (da obe strane ostanu konzistentne)
        await sub.unsubscribe().catch(() => {});
        throw e;
      }
      setEndpoint(json.endpoint);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setPending(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await api.unsubscribePush(existing.endpoint).catch(() => {}); // obriši sa servera pre lokalnog
        await existing.unsubscribe();
      }
      setEndpoint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }, [supported]);

  const sendLocalTest = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Prefa — test obaveštenja', {
        body: 'Radi! Ovako izgleda kad te neko čeka na potezu.',
        icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
        badge: `${import.meta.env.BASE_URL}pwa-64x64.png`,
        tag: 'prefa-local-test',
        data: { url: '/' },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [supported]);

  return {
    supported,
    permission,
    isSubscribed: endpoint !== null,
    pending,
    error,
    subscribe,
    unsubscribe,
    sendLocalTest,
  };
}
