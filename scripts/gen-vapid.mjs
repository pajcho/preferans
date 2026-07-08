// Generiše VAPID (P-256) par za Web Push u standardnom formatu:
//   public  = base64url(0x04 || X || Y)  (65 B)
//   private = base64url(d)               (32 B)
// Javni ključ ide u workers/wrangler.jsonc (VAPID_PUBLIC_KEY) i src/pwa/pwaConfig.ts;
// privatni u workers/.dev.vars (lokalno) i `wrangler secret put VAPID_PRIVATE_KEY` (prod).
import { webcrypto } from 'node:crypto';

const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);

const b64url = (u8) => Buffer.from(u8).toString('base64url');

console.log('VAPID_PUBLIC_KEY=' + b64url(rawPub));
console.log('VAPID_PRIVATE_KEY=' + jwk.d);
