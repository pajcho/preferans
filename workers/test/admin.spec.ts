// Admin API (/api/admin/*): autorizacija tokenom + oblik odgovora.
import { SELF, env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type {
  AdminGameDetail,
  AdminGamesResponse,
  AdminPlayersResponse,
  AdminStats,
} from '../../src/protocol/admin.ts'
import type { AuthResponse, CreateGameResponse } from '../../src/protocol/messages.ts'

const BASE = 'https://prefa.test'
const ADMIN = 'test-admin' // vidi vitest.config.ts
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

async function adminGet<T>(path: string, opts: { token?: string; expect?: number } = {}): Promise<T> {
  const res = await SELF.fetch(`${BASE}${path}`, {
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
  })
  expect(res.status).toBe(opts.expect ?? 200)
  return res.json()
}

async function createGame(token: string, displayName = 'Ana'): Promise<CreateGameResponse> {
  const res = await SELF.fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, seats: SEATS_BOTS }),
  })
  expect(res.status).toBe(200)
  return res.json()
}

describe('Admin API', () => {
  it('bez tokena 401, sa pogrešnim 401, sa ispravnim 200', async () => {
    await adminGet('/api/admin/ping', { expect: 401 })
    await adminGet('/api/admin/ping', { token: 'pogresan', expect: 401 })
    // igrački token NIJE admin token
    const { token } = await anon()
    await adminGet('/api/admin/ping', { token, expect: 401 })
    const ping = await adminGet<{ ok: true }>('/api/admin/ping', { token: ADMIN })
    expect(ping.ok).toBe(true)
  })

  it('stats vraća ukupne brojke, dnevnu seriju i breakdowne', async () => {
    const { token } = await anon()
    await createGame(token)

    const stats = await adminGet<AdminStats>('/api/admin/stats', { token: ADMIN })
    expect(stats.totals.games).toBeGreaterThanOrEqual(1)
    expect(stats.totals.byStatus.active).toBeGreaterThanOrEqual(1)
    expect(stats.totals.players).toBeGreaterThanOrEqual(1)
    expect(stats.totals.activeNow).toBeGreaterThanOrEqual(1)
    expect(stats.daily).toHaveLength(30)
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = stats.daily.find((d) => d.date === today)
    expect(todayRow?.created).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(stats.contracts)).toBe(true)
    expect(Array.isArray(stats.countries)).toBe(true)
  })

  it('games lista sa filterom i pretragom; detalj ima log poteza iz DO', async () => {
    const { token, userId } = await anon()
    const created = await createGame(token, 'Boban')

    const all = await adminGet<AdminGamesResponse>('/api/admin/games', { token: ADMIN })
    expect(all.total).toBeGreaterThanOrEqual(1)
    const mine = all.games.find((g) => g.code === created.code)
    expect(mine).toBeDefined()
    expect(mine!.players).toHaveLength(3)

    // filter po statusu + pretraga po imenu igrača
    const active = await adminGet<AdminGamesResponse>('/api/admin/games?status=active', { token: ADMIN })
    expect(active.games.every((g) => g.status === 'active')).toBe(true)
    const byName = await adminGet<AdminGamesResponse>('/api/admin/games?q=Boban', { token: ADMIN })
    expect(byName.games.some((g) => g.code === created.code)).toBe(true)
    // userId je dovoljan kao prefiks (u tabelama se prikazuje skraćen)
    const byUser = await adminGet<AdminGamesResponse>(`/api/admin/games?q=${userId.slice(0, 8)}`, { token: ADMIN })
    expect(byUser.games.some((g) => g.code === created.code)).toBe(true)

    const detail = await adminGet<AdminGameDetail>(`/api/admin/games/${created.code}`, { token: ADMIN })
    expect(detail.game.code).toBe(created.code)
    expect(detail.live).not.toBeNull()
    expect(detail.live!.actions.length).toBeGreaterThanOrEqual(1)
    expect(detail.live!.actions[0].action.type).toBe('INIT')
    expect(detail.live!.state?.hands.flat().length).toBeGreaterThan(0)

    await adminGet('/api/admin/games/XXXXXX', { token: ADMIN, expect: 404 })
  })

  it('create/join upisuju profil igrača (players tabela → /api/admin/players)', async () => {
    const { token, userId } = await anon()
    await createGame(token, 'Ceca')

    // upsertPlayer ide kroz waitUntil — sačekaj da se slegne
    await new Promise((r) => setTimeout(r, 100))
    const row = await env.DB.prepare('SELECT display_name FROM players WHERE user_id = ?')
      .bind(userId)
      .first<{ display_name: string }>()
    expect(row?.display_name).toBe('Ceca')

    const players = await adminGet<AdminPlayersResponse>('/api/admin/players', { token: ADMIN })
    const me = players.players.find((p) => p.userId === userId)
    expect(me).toBeDefined()
    expect(me!.gamesPlayed).toBeGreaterThanOrEqual(1)
  })
})
