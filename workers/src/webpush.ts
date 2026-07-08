// Web Push (VAPID + aes128gcm) preko Web Crypto API-ja — radi na Cloudflare Workers/DO.
// Node-ov `web-push` paket koristi Node crypto/https i ne radi na workerd-u, pa je ovde
// implementiran ceo protokol ručno:
//   • RFC 8291 — Message Encryption for Web Push (ECDH P-256 + HKDF + AES-128-GCM)
//   • RFC 8188 — aes128gcm content coding (jedan record)
//   • RFC 8292 — VAPID (ES256 JWT, `Authorization: vapid t=…, k=…`)

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string; // base64url raw EC tačke primaoca (65 B)
  auth: string; // base64url auth secret (16 B)
}

export interface VapidKeys {
  publicKey: string; // base64url raw EC tačke (65 B)
  privateKey: string; // base64url `d` skalar (32 B)
  subject: string; // "mailto:…" ili https URL kontakt
}

export interface SendOptions {
  ttl?: number; // sekunde koliko push servis čuva poruku ako je uređaj offline
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

// ── base64url ────────────────────────────────────────────────────────────────
export function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** HKDF (extract + expand) preko Web Crypto — dovoljno za length ≤ 32 (aes128gcm koristi 16/12). */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ── VAPID JWT (ES256) ────────────────────────────────────────────────────────
export async function createVapidJwt(endpoint: string, vapid: VapidKeys): Promise<string> {
  const pub = base64UrlDecode(vapid.publicKey); // 65 B: 0x04 || X(32) || Y(32)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(pub.slice(1, 33)),
    y: base64UrlEncode(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  };
  const signingKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: new URL(endpoint).origin,
    exp: now + 12 * 60 * 60, // spec dozvoljava max 24h; 12h je bezbedno
    sub: vapid.subject,
  };
  const signingInput =
    base64UrlEncode(enc.encode(JSON.stringify(header))) + '.' + base64UrlEncode(enc.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, enc.encode(signingInput));
  // Web Crypto ECDSA već vraća sirovi r||s (JOSE format) — tačno što ES256 JWT traži.
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

// ── aes128gcm enkripcija poruke (RFC 8291 + 8188) ────────────────────────────
export interface EncryptOverrides {
  salt?: Uint8Array;
  serverKeys?: CryptoKeyPair; // ECDH P-256 (samo za determinističke testove)
}

export async function encryptPayload(
  payload: string | Uint8Array,
  p256dh: string,
  authSecret: string,
  overrides?: EncryptOverrides,
): Promise<Uint8Array> {
  const uaPublic = base64UrlDecode(p256dh); // 65 B
  const auth = base64UrlDecode(authSecret); // 16 B
  const plaintext = typeof payload === 'string' ? enc.encode(payload) : payload;

  const salt = overrides?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  // (Cloudflare Workers tipovi vraćaju CryptoKey|CryptoKeyPair i ArrayBuffer|JsonWebKey
  //  pa su cast-ovi ovde samo za tsc — runtime je standardni Web Crypto.)
  const serverKeys =
    overrides?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer); // 65 B

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      serverKeys.privateKey,
      256,
    ),
  ); // 32 B

  // RFC 8291: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);

  // RFC 8188: CEK i NONCE iz (salt, IKM)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const gcmKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  // Jedan record: plaintext || 0x02 (poslednji delimiter), bez dodatnog padding-a.
  const record = concat(plaintext, Uint8Array.of(0x02));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, gcmKey, record),
  );

  // Header (RFC 8188): salt(16) | rs(4, BE) | idlen(1) | keyid(as_public, 65)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concat(header, ciphertext);
}

// ── Slanje ───────────────────────────────────────────────────────────────────
export interface SendResult {
  ok: boolean;
  status: number;
  /** true kada push servis kaže da je pretplata mrtva (404/410) → obriši je iz baze. */
  gone: boolean;
}

export async function sendWebPush(
  sub: PushSubscriptionData,
  payload: string,
  vapid: VapidKeys,
  opts?: SendOptions,
): Promise<SendResult> {
  const body = await encryptPayload(payload, sub.p256dh, sub.auth);
  const jwt = await createVapidJwt(sub.endpoint, vapid);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts?.ttl ?? 3600),
      Urgency: opts?.urgency ?? 'high',
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body: body as BodyInit,
  });

  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}
