// Kriptografski slučajni brojevi (Math.random nije za kodove/seed-ove).

// bez dvosmislenih znakova (0/O, 1/I/L) — 30^6 ≈ 729M kombinacija
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345678'

export function generateCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function randomSeed(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]
}

export function randomInt(maxExclusive: number): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] % maxExclusive
}
