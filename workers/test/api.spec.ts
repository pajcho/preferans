// Worker HTTP + WebSocket integracija (SELF = ceo worker sa routerom).
import { SELF } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import type {
  AuthResponse,
  CreateGameResponse,
  JoinGameResponse,
  MyGame,
  ServerMessage,
  ViewResponse,
} from '../../src/protocol/messages.ts'

const BASE = 'https://prefa.test'
const SEATS_BOTS = [
  { type: 'human' },
  { type: 'bot', difficulty: 'easy' },
  { type: 'bot', difficulty: 'easy' },
]
const SEATS_2H = [{ type: 'human' }, { type: 'human' }, { type: 'bot', difficulty: 'easy' }]

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

/** Kreira i odmah STARTUJE partiju (create više nikad ne startuje sam). */
async function createGame(token: string, seats: unknown = SEATS_BOTS): Promise<CreateGameResponse> {
  const created = await call<CreateGameResponse>('/api/games', { token, body: { displayName: 'Ana', seats } })
  await call(`/api/games/${created.code}/start`, { token, method: 'POST' })
  return created
}

describe('REST API', () => {
  it('anon auth vraća identitet; falsifikovan token je odbijen', async () => {
    const { userId, token } = await anon()
    expect(userId).toMatch(/^[0-9a-f-]{36}$/)
    expect(token.startsWith(`${userId}.`)).toBe(true)

    await call('/api/games', { token: `${userId}.AAAA`, body: { displayName: 'X', seats: SEATS_BOTS }, expect: 401 })
    await call('/api/games', { body: { displayName: 'X', seats: SEATS_BOTS }, expect: 401 })
  })

  it('create validira ime i mesta', async () => {
    const { token } = await anon()
    await call('/api/games', { token, body: { displayName: '', seats: SEATS_BOTS }, expect: 400 })
    await call('/api/games', { token, body: { displayName: 'Ana', seats: [{ type: 'bot', difficulty: 'easy' }] }, expect: 400 })
  })

  it('create → lobi; start deli karte; view vraća redigovan pogled; kod je 6 znakova', async () => {
    const { token } = await anon()
    const created = await call<CreateGameResponse>('/api/games', {
      token,
      body: { displayName: 'Ana', seats: SEATS_BOTS },
    })
    expect(created.code).toMatch(/^[A-Z2-8]{6}$/)
    expect(created.status).toBe('lobby') // više nema auto-starta ni sa botovima

    await call(`/api/games/${created.code}/start`, { token, method: 'POST' })
    const view = await call<ViewResponse>(`/api/games/${created.code}/view`, { token })
    expect(view.game.status).toBe('active')
    expect(view.role).toBe('player')
    expect(view.mySeat).toBe(created.seat)
    expect(view.game.players).toHaveLength(3)
    expect(view.state?.hands[created.seat]).toHaveLength(10)
  })

  it('create bez seats → kreator + 2 slobodna mesta; config menja mesta/pravila; start traži pun sto', async () => {
    const { token } = await anon()
    const created = await call<CreateGameResponse>('/api/games', { token, body: { displayName: 'Ana' } })
    expect(created.status).toBe('lobby')

    let view = await call<ViewResponse>(`/api/games/${created.code}/view`, { token })
    expect(view.game.seats).toEqual([{ type: 'human' }, { type: 'human' }, { type: 'human' }])
    expect(view.game.players).toHaveLength(1)
    expect(view.game.startingBule).toBe(100)
    expect(view.game.maxRefe).toBe(2)

    // start pre popune mesta → 409
    await call(`/api/games/${created.code}/start`, { token, method: 'POST', expect: 409 })

    // validacija config-a
    await call(`/api/games/${created.code}/config`, { token, body: { startingBule: 7 }, expect: 400 })
    await call(`/api/games/${created.code}/config`, { token, body: { maxRefe: 99 }, expect: 400 })
    await call(`/api/games/${created.code}/config`, { token, body: {}, expect: 400 })
    await call(`/api/games/${created.code}/config`, { token, body: { seat: 5, seatConfig: { type: 'human' } }, expect: 400 })

    // samo kreator podešava
    const b = await anon()
    await call(`/api/games/${created.code}/config`, { token: b.token, body: { maxRefe: 2 }, expect: 403 })

    // popuni slobodna mesta botovima + podesi pravila
    const free = [0, 1, 2].filter((i) => i !== created.seat)
    await call(`/api/games/${created.code}/config`, {
      token,
      body: { seat: free[0], seatConfig: { type: 'bot', difficulty: 'easy' } },
    })
    await call(`/api/games/${created.code}/config`, {
      token,
      body: { seat: free[1], seatConfig: { type: 'bot', difficulty: 'hard' }, startingBule: 20, maxRefe: 0 },
    })

    await call(`/api/games/${created.code}/start`, { token, method: 'POST' })
    view = await call<ViewResponse>(`/api/games/${created.code}/view`, { token })
    expect(view.game.status).toBe('active')
    expect(view.game.startingBule).toBe(20)
    expect(view.game.maxRefe).toBe(0)
    expect(view.state?.ledger.bule).toEqual([20, 20, 20])
  })

  it('join: lobi → mesto (bez auto-starta), pun lobi → čekaonica, nepostojeći kod → 404', async () => {
    const a = await anon()
    const b = await anon()
    const c = await anon()
    const created = await call<CreateGameResponse>('/api/games', {
      token: a.token,
      body: { displayName: 'Ana', seats: SEATS_2H },
    })
    expect(created.status).toBe('lobby')

    const joinB = await call<JoinGameResponse>('/api/games/join', {
      token: b.token,
      body: { code: created.code, displayName: 'Boban' },
    })
    expect(joinB.role).toBe('player')
    expect(joinB.status).toBe('lobby') // čeka se start kreatora

    // pun lobi → čekaonica
    const joinC = await call<JoinGameResponse>('/api/games/join', {
      token: c.token,
      body: { code: created.code, displayName: 'Ceca' },
    })
    expect(joinC.role).toBe('spectator')
    expect(joinC.waitingPos).toBe(1)

    await call('/api/games/join', { token: c.token, body: { code: 'AAAAAA', displayName: 'C' }, expect: 404 })
  })

  it('mine: partija se pojavljuje u „Moje partije" (D1 sync)', async () => {
    const { token } = await anon()
    const created = await createGame(token)
    await vi.waitFor(
      async () => {
        const mine = await call<MyGame[]>('/api/games/mine', { token })
        const game = mine.find((g) => g.code === created.code)
        expect(game).toBeDefined()
        expect(game?.players).toHaveLength(3)
        expect(game?.mySeat).toBe(created.seat)
      },
      { timeout: 5000 },
    )
  })

  it('cancel: samo kreator; debug radi samo uz DEBUG_API', async () => {
    const a = await anon()
    const b = await anon()
    const created = await call<CreateGameResponse>('/api/games', {
      token: a.token,
      body: { displayName: 'Ana', seats: SEATS_2H },
    })
    await call(`/api/games/${created.code}/cancel`, { token: b.token, method: 'POST', expect: 403 })
    await call(`/api/games/${created.code}/cancel`, { token: a.token, method: 'POST' })
    const view = await call<ViewResponse>(`/api/games/${created.code}/view`, { token: a.token })
    expect(view.game.status).toBe('abandoned')
  })
})

describe('WebSocket', () => {
  async function connect(code: string, token: string) {
    const res = await SELF.fetch(`${BASE}/api/games/${code}/ws?token=${encodeURIComponent(token)}`, {
      headers: { Upgrade: 'websocket' },
    })
    expect(res.status).toBe(101)
    const ws = res.webSocket!
    const messages: ServerMessage[] = []
    ws.accept()
    ws.addEventListener('message', (e) => {
      messages.push(JSON.parse(e.data as string) as ServerMessage)
    })
    return { ws, messages }
  }

  it('bez validnog tokena nema upgrade-a', async () => {
    const { token } = await anon()
    const created = await createGame(token)
    const res = await SELF.fetch(`${BASE}/api/games/${created.code}/ws?token=bogus`, {
      headers: { Upgrade: 'websocket' },
    })
    expect(res.status).toBe(401)
  })

  it('na konekciji stiže view; sync vraća view + presence; server-only potez vraća error', async () => {
    const { token } = await anon()
    const created = await createGame(token)
    const { ws, messages } = await connect(created.code, token)

    await vi.waitFor(() => expect(messages.some((m) => m.type === 'view')).toBe(true))
    const first = messages.find((m) => m.type === 'view')!
    expect(first.type === 'view' && first.view.mySeat).toBe(created.seat)

    ws.send(JSON.stringify({ type: 'act', reqId: 'r1', action: { type: 'RESOLVE_TRICK' } }))
    await vi.waitFor(() => {
      const err = messages.find((m) => m.type === 'error' && m.reqId === 'r1')
      expect(err).toBeDefined()
      expect(err?.type === 'error' && err.message).toBe('Ovaj potez primenjuje server')
    })

    ws.send(JSON.stringify({ type: 'sync' }))
    await vi.waitFor(() => expect(messages.some((m) => m.type === 'presence')).toBe(true))
    ws.close()
  })

  it('čekaonica: POVEZAN čekač automatski seda kad kreator oslobodi mesto (bot → igrač)', async () => {
    const a = await anon()
    const b = await anon()
    const c = await anon()

    // sto 2 čoveka + bot: Ana kreira, Boban seda → lobi pun; Ceca → čekaonica #1
    const created = await call<CreateGameResponse>('/api/games', {
      token: a.token,
      body: { displayName: 'Ana', seats: SEATS_2H },
    })
    await call('/api/games/join', { token: b.token, body: { code: created.code, displayName: 'Boban' } })
    const joinC = await call<JoinGameResponse>('/api/games/join', {
      token: c.token,
      body: { code: created.code, displayName: 'Ceca' },
    })
    expect(joinC.waitingPos).toBe(1)

    // Ceca drži otvoren WS (povezana je) — u view-u je u čekaonici
    const cWs = await connect(created.code, c.token)
    await vi.waitFor(() => {
      const v = cWs.messages.findLast((m) => m.type === 'view')
      expect(v?.type === 'view' && v.view.game.yourWaitingPos).toBe(1)
      expect(v?.type === 'view' && v.view.game.waiting).toEqual([{ displayName: 'Ceca', connected: true }])
    })

    // kreator prebaci bot mesto na igrača → Ceca automatski seda
    const view = await call<ViewResponse>(`/api/games/${created.code}/view`, { token: a.token })
    const botSeat = view.game.seats.findIndex((s) => s.type === 'bot')
    await call(`/api/games/${created.code}/config`, {
      token: a.token,
      body: { seat: botSeat, seatConfig: { type: 'human' } },
    })
    await vi.waitFor(() => {
      const last = cWs.messages.findLast((m) => m.type === 'view')
      expect(last?.type === 'view' && last.view.role).toBe('player')
      expect(last?.type === 'view' && last.view.mySeat).toBe(botSeat)
    })

    // čekaonica prazna, sto pun (3 čoveka) → start radi
    const after = await call<ViewResponse>(`/api/games/${created.code}/view`, { token: a.token })
    expect(after.game.waiting).toEqual([])
    expect(after.game.players.filter((p) => !p.isBot)).toHaveLength(3)
    await call(`/api/games/${created.code}/start`, { token: a.token, method: 'POST' })
    cWs.ws.close()
  })

  it('ustajanje sa mesta u lobiju: oslobođeno mesto odmah dobija povezan čekač', async () => {
    const a = await anon()
    const b = await anon()
    const c = await anon()
    const created = await call<CreateGameResponse>('/api/games', {
      token: a.token,
      body: { displayName: 'Ana', seats: SEATS_2H },
    })
    const joinB = await call<JoinGameResponse>('/api/games/join', {
      token: b.token,
      body: { code: created.code, displayName: 'Boban' },
    })
    await call('/api/games/join', { token: c.token, body: { code: created.code, displayName: 'Ceca' } })

    const cWs = await connect(created.code, c.token)
    await vi.waitFor(() => expect(cWs.messages.some((m) => m.type === 'view')).toBe(true))

    // Boban ustane od stola → Ceca (povezana, #1 u redu) automatski seda na njegovo mesto
    await call(`/api/games/${created.code}/leave`, { token: b.token, method: 'POST' })
    await vi.waitFor(() => {
      const last = cWs.messages.findLast((m) => m.type === 'view')
      expect(last?.type === 'view' && last.view.role).toBe('player')
      expect(last?.type === 'view' && last.view.mySeat).toBe(joinB.seat)
    })
    cWs.ws.close()
  })

  it('posmatrač preko WS dobija redigovan view (sve ruke skrivene) i vidi tuđe poteze uživo', async () => {
    const a = await anon()
    const spec = await anon()
    const created = await createGame(a.token)

    const specWs = await connect(created.code, spec.token)
    await vi.waitFor(() => expect(specWs.messages.some((m) => m.type === 'view')).toBe(true))
    const view = specWs.messages.find((m) => m.type === 'view')!
    if (view.type !== 'view') throw new Error('nije view')
    expect(view.view.role).toBe('spectator')
    const isFiller = (c: { suit: string; rank: string }) => c.suit === 'pik' && c.rank === '7'
    expect(view.view.state!.hands.flat().every(isFiller)).toBe(true)

    // igrač povuče potez preko svog WS-a → posmatraču stiže nov view (push, bez poll-a)
    const before = specWs.messages.filter((m) => m.type === 'view').length
    const playerWs = await connect(created.code, a.token)
    await vi.waitFor(() => expect(playerWs.messages.some((m) => m.type === 'view')).toBe(true))
    const pv = playerWs.messages.findLast((m) => m.type === 'view')!
    if (pv.type !== 'view') throw new Error('nije view')

    // na potezu je čovek ili bot; ako je čovek, odigraj „dalje" (PASS)
    if (pv.view.state && pv.view.game.currentActor === pv.view.mySeat && pv.view.game.phase === 'bidding') {
      playerWs.ws.send(
        JSON.stringify({ type: 'act', reqId: 'r2', action: { type: 'PASS', seat: pv.view.mySeat } }),
      )
      await vi.waitFor(() => {
        expect(specWs.messages.filter((m) => m.type === 'view').length).toBeGreaterThan(before)
      })
    }
    specWs.ws.close()
    playerWs.ws.close()
  })
})
