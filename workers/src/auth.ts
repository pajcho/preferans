// Anonimni identitet: userId (UUID) + HMAC-SHA256 potpis sa AUTH_SECRET.
// Token format: "<userId>.<base64url potpis>" — klijent ga čuva u localStorage
// i šalje kao Bearer header (REST) odnosno ?token= query (WebSocket).
import type { AuthResponse } from '../../src/protocol/messages.ts'

const enc = new TextEncoder()

export function b64urlEncode(buf: ArrayBuffer): string {
  let bin = ''
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function hmacKey(secret: string, usages: ('sign' | 'verify')[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages)
}

/** Token za dati userId — deterministički (HMAC), pa login uvek vraća isti token. */
export async function signToken(secret: string, userId: string): Promise<string> {
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(userId))
  return `${userId}.${b64urlEncode(sig)}`
}

export async function issueIdentity(secret: string): Promise<AuthResponse> {
  const userId = crypto.randomUUID()
  return { userId, token: await signToken(secret, userId) }
}

/** Vrati userId iz tokena ili null (crypto.subtle.verify je otporan na timing napade). */
export async function verifyToken(secret: string, token: string | null | undefined): Promise<string | null> {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const sig = b64urlDecode(token.slice(dot + 1))
  if (!sig || sig.length === 0) return null
  const key = await hmacKey(secret, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, sig as unknown as ArrayBuffer, enc.encode(userId))
  return valid ? userId : null
}
