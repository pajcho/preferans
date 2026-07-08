import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, createVapidJwt, encryptPayload } from '../src/webpush';

const enc = new TextEncoder();
const dec = new TextDecoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Nezavisna klijentska dekripcija aes128gcm body-ja po RFC 8291/8188 — validira encryptPayload. */
async function decryptAsClient(
  body: Uint8Array,
  clientPrivate: CryptoKey,
  clientPublicRaw: Uint8Array,
  auth: Uint8Array,
): Promise<string> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);

  const asPubKey = await crypto.subtle.importKey(
    'raw',
    asPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asPubKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      clientPrivate,
      256,
    ),
  );

  const keyInfo = concat(enc.encode('WebPush: info\0'), clientPublicRaw, asPublic);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const gcmKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['decrypt']);
  const record = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 }, gcmKey, ciphertext),
  );
  expect(record[record.length - 1]).toBe(0x02); // poslednji record delimiter
  return dec.decode(record.slice(0, -1));
}

describe('webpush enkripcija (RFC 8291 aes128gcm)', () => {
  it('encrypt→decrypt round-trip vraća isti tekst', async () => {
    // Klijent (primalac) generiše ECDH par + auth secret, kao pravi browser.
    const clientKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const clientPublicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', clientKeys.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));

    const payload = JSON.stringify({ title: 'Prefa', body: 'Na potezu si!', url: '/o/ABC123', tag: 'turn-ABC123' });
    const body = await encryptPayload(payload, base64UrlEncode(clientPublicRaw), base64UrlEncode(auth));

    // Struktura header-a: salt(16) | rs(4) | idlen(1)=65 | as_public(65)
    expect(body[20]).toBe(65);
    expect(body.length).toBeGreaterThan(21 + 65);

    const roundTripped = await decryptAsClient(body, clientKeys.privateKey, clientPublicRaw, auth);
    expect(roundTripped).toBe(payload);
  });

  it('svaki poziv koristi nov salt/ephemeral ključ (različit ciphertext)', async () => {
    const clientKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const clientPublicRaw = new Uint8Array((await crypto.subtle.exportKey('raw', clientKeys.publicKey)) as ArrayBuffer);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const a = await encryptPayload('isti tekst', base64UrlEncode(clientPublicRaw), base64UrlEncode(auth));
    const b = await encryptPayload('isti tekst', base64UrlEncode(clientPublicRaw), base64UrlEncode(auth));
    expect(base64UrlEncode(a)).not.toBe(base64UrlEncode(b));
  });
});

describe('VAPID JWT (RFC 8292, ES256)', () => {
  it('potpisuje token koji se verifikuje javnim ključem, sa ispravnim claim-ovima', async () => {
    // VAPID par (raw public 65B, private d 32B) — kao iz `web-push generate-vapid-keys`.
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const rawPub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
    const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;

    const vapid = {
      publicKey: base64UrlEncode(rawPub),
      privateKey: jwk.d!,
      subject: 'mailto:prefa@example.com',
    };
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
    const jwt = await createVapidJwt(endpoint, vapid);

    const [h, p, s] = jwt.split('.');
    const header = JSON.parse(dec.decode(base64UrlDecode(h)));
    const claims = JSON.parse(dec.decode(base64UrlDecode(p)));
    expect(header).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:prefa@example.com');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const verifyKey = await crypto.subtle.importKey(
      'raw',
      rawPub as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64UrlDecode(s) as BufferSource,
      enc.encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });
});
