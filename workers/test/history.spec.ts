// Server-backed istorija: lista završenih partija, replay endpoint (guards) i
// placeholder ime kad se partija pravi bez imena (anonimni userId je pravi ID).
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { AuthResponse, CreateGameResponse, HistoryGameItem } from '../../src/protocol/messages.ts'

const BASE = 'https://prefa.test'
const SEATS_BOTS = [
  { type: 'human' },
  { type: 'bot', difficulty: 'easy' },
  { type: 'bot', difficulty: 'easy' },
]

async function anon(): Promise<AuthResponse> {
  const res = await SELF.fetch(`${BASE}/api/auth/anon`, { method: 'POST' })
  expect(res.status).toBe(200)
  return res.json()
}

async function call<T = unknown>(
  path: string,
  opts: { token?: string; method?: string; body?: unknown; expect?: number } = {},
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
  return res.json() as Promise<T>
}

function name(userId: string): Promise<{ display_name: string } | null> {
  return env.DB.prepare('SELECT display_name FROM players WHERE user_id = ?').bind(userId).first()
}

describe('istorija + replay', () => {
  it('history traži auth i vraća praznu listu za novog igrača', async () => {
    await call('/api/games/history', { expect: 401 })
    const { token } = await anon()
    const list = await call<HistoryGameItem[]>('/api/games/history', { token })
    expect(list).toEqual([])
  })

  it('replay guards: 404 nepostojeća, 403 nisi učesnik, 409 nezavršena', async () => {
    const { token } = await anon()
    await call('/api/games/XXXXXX/replay', { token, expect: 404 })

    const created = await call<CreateGameResponse>('/api/games', { token, body: { displayName: 'A', seats: SEATS_BOTS } })
    await call(`/api/games/${created.code}/start`, { token, method: 'POST' })

    // stranac (drugi identitet) ne sme ni da sazna status → 403
    const stranger = await anon()
    await call(`/api/games/${created.code}/replay`, { token: stranger.token, expect: 403 })
    // učesnik, ali partija još traje → 409
    await call(`/api/games/${created.code}/replay`, { token, expect: 409 })
  })
})

describe('završene ruke (/hands) — backfill „Prethodne ruke"', () => {
  it('traži auth; sveža partija (ruka u toku) → prazna lista, tekuća ruka se ne otkriva', async () => {
    await call('/api/games/XXXXXX/hands', { expect: 401 })

    const { token } = await anon()
    const created = await call<CreateGameResponse>('/api/games', { token, body: { displayName: 'A', seats: SEATS_BOTS } })
    await call(`/api/games/${created.code}/start`, { token, method: 'POST' })

    // ruka 1 je tek počela — nijedna nije obodovana → prazna lista (server-side rekonstrukcija radi,
    // tekuća ruka nije uključena pa se karte ne otkrivaju)
    const res = await call<{ hands: unknown[] }>(`/api/games/${created.code}/hands`, { token })
    expect(res.hands).toEqual([])
  })
})

describe('placeholder ime (partija bez imena)', () => {
  it('dodeli Gost-placeholder i NE gazi već poznato pravo ime', async () => {
    const { token, userId } = await anon()

    // bez imena → placeholder „Gost-XXXX"
    await call('/api/games', { token, body: { seats: SEATS_BOTS } })
    await new Promise((r) => setTimeout(r, 100)) // upsertPlayer ide kroz waitUntil
    expect((await name(userId))?.display_name).toMatch(/^Gost-/)

    // sada SA imenom → pamti se
    await call('/api/games', { token, body: { displayName: 'Nikola', seats: SEATS_BOTS } })
    await new Promise((r) => setTimeout(r, 100))
    expect((await name(userId))?.display_name).toBe('Nikola')

    // opet bez imena → NE sme da pregazi „Nikola" placeholderom
    await call('/api/games', { token, body: { seats: SEATS_BOTS } })
    await new Promise((r) => setTimeout(r, 100))
    expect((await name(userId))?.display_name).toBe('Nikola')
  })
})
