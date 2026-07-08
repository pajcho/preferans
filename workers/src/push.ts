// Skladištenje Web Push pretplata (D1) + slanje obaveštenja korisniku.
// Enkripcija/VAPID su u webpush.ts; ovde je D1 sloj + fan-out na sve uređaje.
import { sendWebPush, type SendOptions, type VapidKeys } from './webpush.ts';

export interface NotifyPayload {
  title: string;
  body?: string;
  url?: string; // deep-link (npr. /o/ABC123); SW ga otvara na klik
  tag?: string; // isti tag skuplja duplikate (npr. jedan po partiji)
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** VAPID ključevi iz env-a ili null ako push nije konfigurisan (tada je slanje no-op). */
export function getVapidKeys(env: Env): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function pushConfigured(env: Env): boolean {
  return getVapidKeys(env) !== null;
}

export async function saveSubscription(
  env: Env,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, user_agent, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, last_seen = excluded.last_seen`,
  )
    .bind(sub.endpoint, userId, sub.p256dh, sub.auth, sub.userAgent ?? null, now, now)
    .run();
}

/** Briše pretplatu (samo vlasnik). */
export async function deleteSubscription(env: Env, userId: string, endpoint: string): Promise<void> {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(endpoint, userId)
    .run();
}

/** Ima li korisnik bar jednu pretplatu (tj. da li mu push slanje uopšte ima smisla). */
export async function userHasSubscription(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1').bind(userId).first();
  return row !== null;
}

/**
 * Pošalji push svim uređajima korisnika. Mrtve pretplate (404/410) se brišu.
 * Vraća broj uspešno poslatih. Bez konfigurisanog VAPID-a → 0 (no-op).
 */
export async function notifyUser(
  env: Env,
  userId: string,
  payload: NotifyPayload,
  opts?: SendOptions,
): Promise<number> {
  const vapid = getVapidKeys(env);
  if (!vapid) return 0;

  const subs = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
    .bind(userId)
    .all<StoredSubscription>();
  if (subs.results.length === 0) return 0;

  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.results.map(async (s) => {
      const res = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, message, vapid, opts);
      if (res.gone) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(s.endpoint).run();
      }
      return res.ok;
    }),
  );

  let sent = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) sent++;
    else if (r.status === 'rejected') console.error('[push] slanje nije uspelo:', r.reason);
  }
  return sent;
}
