// Heširanje lozinki: PBKDF2-SHA256 kroz WebCrypto (nativno u workerd-u).
// Workers ograničava PBKDF2 na max 100k iteracija — koristimo tačno toliko.
// Format zapisa: "pbkdf2$<iteracije>$<salt b64url>$<hash b64url>".
import { b64urlDecode, b64urlEncode } from './auth.ts';

const ITERATIONS = 100_000;
const HASH_BYTES = 32;

const enc = new TextEncoder();

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as ArrayBuffer, iterations },
    key,
    HASH_BYTES * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64urlEncode(salt.buffer)}$${b64urlEncode(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  const salt = b64urlDecode(parts[2]);
  const expected = b64urlDecode(parts[3]);
  if (!Number.isInteger(iterations) || iterations < 1 || !salt || !expected) return false;

  const actual = new Uint8Array(await deriveBits(password, salt, iterations));
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
