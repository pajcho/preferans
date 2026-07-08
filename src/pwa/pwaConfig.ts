// VAPID javni ključ za Web Push — par sa VAPID_PRIVATE_KEY na serveru
// (workers/wrangler.jsonc + workers/.dev.vars). Javni ključ je javan po dizajnu, sme u bundle.
// Rotacija para poništava sve postojeće pretplate (moraju se ponovo prijaviti).
export const VAPID_PUBLIC_KEY =
  'BGTd77Cah8f6AB7xUaoYrsPBT_Y7uc8ebc8Yz0qcjee-kNK6OGLmG4wO0rLoPH54LhPQwXGZIq5Swsp6dSIeRuk';

/** URL-safe base64 → Uint8Array (za pushManager.subscribe({ applicationServerKey })). */
export function vapidPublicKeyToUint8Array(): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
  const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length); // eksplicitan ArrayBuffer → validan BufferSource
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
