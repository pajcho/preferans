// Nalozi: registracija (nadogradnja anonimnog identiteta), prijava, profil.
// Ključna garancija: userId se NE menja registracijom, pa partije odigrane
// pre registracije ostaju u „Moje partije" i posle prijave na drugom uređaju.
import { SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import type {
  AccountResponse,
  AuthResponse,
  CreateGameResponse,
  MeResponse,
  MyGame,
} from '../../src/protocol/messages.ts'

const BASE = 'https://prefa.test'

let emailSeq = 0
/** jedinstven email po testu — D1 je izolovan po FAJLU, ne po testu */
function freshEmail(): string {
  emailSeq += 1
  return `igrac${emailSeq}@prefa.test`
}

async function anon(): Promise<AuthResponse> {
  const res = await SELF.fetch(`${BASE}/api/auth/anon`, { method: 'POST' })
  expect(res.status).toBe(200)
  return res.json()
}

async function call<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; expect?: number } = {},
): Promise<T> {
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  expect(res.status).toBe(opts.expect ?? 200)
  return res.json()
}

describe('Nalozi (register/login/me/profile)', () => {
  it('register validira email i lozinku; traži Bearer', async () => {
    const { token } = await anon()
    await call('/api/auth/register', { body: { email: freshEmail(), password: 'lozinka123' }, expect: 401 })
    await call('/api/auth/register', { token, body: { email: 'nije-email', password: 'lozinka123' }, expect: 400 })
    await call('/api/auth/register', { token, body: { email: freshEmail(), password: 'kratka' }, expect: 400 })
  })

  it('register zadržava userId, me vraća nalog, ponovni register → 409', async () => {
    const { userId, token } = await anon()
    const email = freshEmail()

    const before = await call<MeResponse>('/api/auth/me', { token })
    expect(before).toEqual({ userId, registered: false, email: null, displayName: null })

    const acc = await call<AccountResponse>('/api/auth/register', {
      token,
      body: { email, password: 'lozinka123', displayName: 'Nikola' },
    })
    expect(acc.userId).toBe(userId) // isti identitet — istorija ostaje
    expect(acc.token).toBe(token) // token je deterministički za userId
    expect(acc.email).toBe(email)
    expect(acc.displayName).toBe('Nikola')

    const after = await call<MeResponse>('/api/auth/me', { token })
    expect(after).toEqual({ userId, registered: true, email, displayName: 'Nikola' })

    await call('/api/auth/register', { token, body: { email: freshEmail(), password: 'lozinka123' }, expect: 409 })
  })

  it('zauzet email ne može ponovo da se registruje (ni drugim slovima)', async () => {
    const a = await anon()
    const b = await anon()
    const email = freshEmail()
    await call('/api/auth/register', { token: a.token, body: { email, password: 'lozinka123', displayName: 'Ana' } })
    await call('/api/auth/register', {
      token: b.token,
      body: { email: email.toUpperCase(), password: 'drugalozinka', displayName: 'Boban' },
      expect: 409,
    })
  })

  it('login vraća identitet naloga; pogrešna lozinka/nepoznat email → 401', async () => {
    const { userId, token } = await anon()
    const email = freshEmail()
    await call('/api/auth/register', { token, body: { email, password: 'lozinka123', displayName: 'Ana' } })

    const acc = await call<AccountResponse>('/api/auth/login', {
      body: { email: email.toUpperCase(), password: 'lozinka123' },
    })
    expect(acc.userId).toBe(userId)
    expect(acc.displayName).toBe('Ana')
    // token iz login-a je upotrebljiv za autorizovane pozive
    const meRes = await call<MeResponse>('/api/auth/me', { token: acc.token })
    expect(meRes.registered).toBe(true)

    await call('/api/auth/login', { body: { email, password: 'pogresna1' }, expect: 401 })
    await call('/api/auth/login', { body: { email: freshEmail(), password: 'lozinka123' }, expect: 401 })
  })

  it('partije od pre registracije su u „Moje partije" i posle prijave na drugom uređaju', async () => {
    const { token } = await anon()
    const email = freshEmail()

    // anonimno napravi partiju (lobi je dovoljan za „mine")
    const created = await call<CreateGameResponse>('/api/games', { token, body: { displayName: 'Ana' } })

    // registruj se pa se „na drugom uređaju" prijavi (svež token iz login-a)
    await call('/api/auth/register', { token, body: { email, password: 'lozinka123' } })
    const acc = await call<AccountResponse>('/api/auth/login', { body: { email, password: 'lozinka123' } })

    await vi.waitFor(
      async () => {
        const mine = await call<MyGame[]>('/api/games/mine', { token: acc.token })
        expect(mine.some((g) => g.code === created.code)).toBe(true)
      },
      { timeout: 5000 },
    )
  })

  it('profil: promena imena radi i za anonimnog; email/lozinka traže nalog', async () => {
    const { token } = await anon()
    const meRes = await call<MeResponse>('/api/auth/profile', { token, body: { displayName: 'Zoki' } })
    expect(meRes.displayName).toBe('Zoki')
    expect(meRes.registered).toBe(false)

    await call('/api/auth/profile', { token, body: {}, expect: 400 })
    await call('/api/auth/profile', { token, body: { email: freshEmail() }, expect: 403 })
    await call('/api/auth/profile', { token, body: { newPassword: 'novanova1', currentPassword: 'x' }, expect: 403 })
  })

  it('profil: promena emaila (validacija zauzetosti) i imena', async () => {
    const a = await anon()
    const b = await anon()
    const emailA = freshEmail()
    const emailB = freshEmail()
    await call('/api/auth/register', { token: a.token, body: { email: emailA, password: 'lozinka123', displayName: 'Ana' } })
    await call('/api/auth/register', { token: b.token, body: { email: emailB, password: 'lozinka123', displayName: 'Boban' } })

    // tuđ email → 409; svoj isti email → ok (no-op)
    await call('/api/auth/profile', { token: a.token, body: { email: emailB }, expect: 409 })
    await call('/api/auth/profile', { token: a.token, body: { email: emailA } })

    const novi = freshEmail()
    const meRes = await call<MeResponse>('/api/auth/profile', {
      token: a.token,
      body: { email: novi, displayName: 'Ana Nova' },
    })
    expect(meRes.email).toBe(novi)
    expect(meRes.displayName).toBe('Ana Nova')

    // prijava radi sa novim emailom, sa starim više ne
    await call('/api/auth/login', { body: { email: novi, password: 'lozinka123' } })
    await call('/api/auth/login', { body: { email: emailA, password: 'lozinka123' }, expect: 401 })
  })

  it('profil: promena lozinke traži tačnu trenutnu lozinku', async () => {
    const { token } = await anon()
    const email = freshEmail()
    await call('/api/auth/register', { token, body: { email, password: 'stara-lozinka', displayName: 'Ana' } })

    await call('/api/auth/profile', {
      token,
      body: { newPassword: 'nova-lozinka', currentPassword: 'pogresna' },
      expect: 403,
    })
    await call('/api/auth/profile', { token, body: { newPassword: 'nova-lozinka', currentPassword: 'stara-lozinka' } })

    await call('/api/auth/login', { body: { email, password: 'stara-lozinka' }, expect: 401 })
    const acc = await call<AccountResponse>('/api/auth/login', { body: { email, password: 'nova-lozinka' } })
    expect(acc.email).toBe(email)
  })
})
