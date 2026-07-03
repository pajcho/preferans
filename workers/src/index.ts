// ─────────────────────────────────────────────────────────────
// Worker router: anonimni auth + REST (create/join/mine/view/cancel)
// + prosleđivanje WebSocket upgrade-a na GameRoom DO (ime DO-a = kod partije).
// ─────────────────────────────────────────────────────────────
import type { CreateGameRequest, JoinGameRequest, MyGame, SeatsConfig } from '../../src/protocol/messages.ts'
import type { Difficulty, Seat } from '../../src/engine/index.ts'
import { issueIdentity, verifyToken } from './auth.ts'
import { HttpError, allowedOrigin, cleanName, corsHeaders, json, withCors } from './http.ts'
import { generateCode } from './random.ts'
import type { RoomResult } from './room.ts'

export { GameRoom } from './room.ts'

const CODE_RE = /^[A-Z0-9]{6}$/
const DIFFICULTIES = new Set<Difficulty>(['easy', 'medium', 'hard'])

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env.ALLOWED_ORIGINS, origin) })
    }
    try {
      return withCors(await route(request, env), env.ALLOWED_ORIGINS, origin)
    } catch (e) {
      if (e instanceof HttpError) {
        return withCors(json({ error: e.message }, e.status), env.ALLOWED_ORIGINS, origin)
      }
      console.error('[worker] neočekivana greška:', e)
      return withCors(json({ error: 'Interna greška servera' }, 500), env.ALLOWED_ORIGINS, origin)
    }
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/' && request.method === 'GET') {
    return json({ ok: true, service: 'prefa-backend' })
  }
  if (path === '/api/auth/anon' && request.method === 'POST') {
    return json(await issueIdentity(env.AUTH_SECRET))
  }
  if (path === '/api/games' && request.method === 'POST') {
    return createGame(request, env)
  }
  if (path === '/api/games/join' && request.method === 'POST') {
    return joinGame(request, env)
  }
  if (path === '/api/games/mine' && request.method === 'GET') {
    return myGames(request, env)
  }

  const match = path.match(/^\/api\/games\/([A-Za-z0-9]{6})\/(ws|view|cancel|debug)$/)
  if (match) {
    const code = match[1].toUpperCase()
    if (!CODE_RE.test(code)) throw new HttpError(400, 'Neispravan kod partije')
    const stub = env.GAME_ROOM.getByName(code)

    switch (match[2]) {
      case 'ws': {
        if (request.method !== 'GET') break
        // browser WebSocket ne može da šalje header-e — token ide kroz query
        const userId = await verifyToken(env.AUTH_SECRET, url.searchParams.get('token'))
        if (!userId) throw new HttpError(401, 'Neispravna sesija')
        const origin = request.headers.get('Origin')
        if (origin && !allowedOrigin(env.ALLOWED_ORIGINS, origin)) {
          throw new HttpError(403, 'Origin nije dozvoljen')
        }
        const headers = new Headers(request.headers)
        headers.set('x-user-id', userId)
        return stub.fetch(new Request(request, { headers }))
      }
      case 'view': {
        if (request.method !== 'GET') break
        const userId = await requireUser(request, env)
        return unwrap(await stub.view(userId))
      }
      case 'cancel': {
        if (request.method !== 'POST') break
        const userId = await requireUser(request, env)
        return unwrap(await stub.cancel(userId))
      }
      case 'debug': {
        // SAMO lokalni razvoj/E2E — u produkciji DEBUG_API nije postavljen
        if (env.DEBUG_API !== '1') throw new HttpError(404, 'Nije pronađeno')
        return json(await stub.debugInfo())
      }
    }
  }

  throw new HttpError(404, 'Nije pronađeno')
}

async function createGame(request: Request, env: Env): Promise<Response> {
  const userId = await requireUser(request, env)
  const body = await readJson<CreateGameRequest>(request)

  const displayName = cleanName(body.displayName)
  const seats = validateSeats(body.seats)
  const startingBule =
    Number.isInteger(body.startingBule) && body.startingBule! >= 10 && body.startingBule! <= 200
      ? body.startingBule!
      : 40

  // retry na (malo verovatan) sudar koda — DO sa postojećom partijom odbija create
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode()
    const stub = env.GAME_ROOM.getByName(code)
    const res = await stub.create({ code, createdBy: userId, displayName, seats, startingBule })
    if (res.ok) return json(res.value)
    if (res.message !== 'code-collision') throw new HttpError(res.status, res.message)
  }
  throw new HttpError(500, 'Neuspešno generisanje koda partije')
}

async function joinGame(request: Request, env: Env): Promise<Response> {
  const userId = await requireUser(request, env)
  const body = await readJson<JoinGameRequest>(request)
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!CODE_RE.test(code)) throw new HttpError(400, 'Neispravan kod partije')
  const displayName = cleanName(body.displayName)

  const stub = env.GAME_ROOM.getByName(code)
  return unwrap(await stub.join({ userId, displayName }))
}

/** Nezavršene partije u kojima pozivalac sedi (lookup u D1). */
async function myGames(request: Request, env: Env): Promise<Response> {
  const userId = await requireUser(request, env)

  const games = await env.DB.prepare(
    `SELECT g.code, g.status, g.phase, g.hand_no, g.current_actor, g.updated_at
     FROM games g JOIN game_players p ON p.code = g.code
     WHERE p.user_id = ? AND g.status IN ('lobby', 'active')
     ORDER BY g.updated_at DESC LIMIT 20`,
  )
    .bind(userId)
    .all<{ code: string; status: string; phase: string | null; hand_no: number; current_actor: number | null; updated_at: string }>()

  const codes = games.results.map((g) => g.code)
  const players = codes.length
    ? await env.DB.prepare(
        `SELECT code, seat, user_id, display_name, is_bot FROM game_players
         WHERE code IN (${codes.map(() => '?').join(',')}) ORDER BY seat`,
      )
        .bind(...codes)
        .all<{ code: string; seat: number; user_id: string | null; display_name: string; is_bot: number }>()
    : { results: [] as { code: string; seat: number; user_id: string | null; display_name: string; is_bot: number }[] }

  const list: MyGame[] = games.results.map((g) => {
    const ps = players.results.filter((p) => p.code === g.code)
    return {
      code: g.code,
      status: g.status as MyGame['status'],
      phase: g.phase,
      handNo: g.hand_no,
      currentActor: (g.current_actor ?? null) as Seat | null,
      updatedAt: g.updated_at,
      mySeat: (ps.find((p) => p.user_id === userId)?.seat ?? null) as Seat | null,
      players: ps.map((p) => ({ seat: p.seat as Seat, displayName: p.display_name, isBot: p.is_bot === 1 })),
    }
  })
  return json(list)
}

// ── pomoćno ──

async function requireUser(request: Request, env: Env): Promise<string> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  const userId = await verifyToken(env.AUTH_SECRET, token)
  if (!userId) throw new HttpError(401, 'Neispravna sesija')
  return userId
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Neispravan JSON')
  }
}

function validateSeats(raw: unknown): SeatsConfig {
  if (!Array.isArray(raw) || raw.length !== 3) throw new HttpError(400, 'Konfiguracija mora imati tačno 3 mesta')
  const seats = raw.map((s: { type?: string; difficulty?: Difficulty }) => {
    if (s && s.type === 'human') return { type: 'human' as const }
    if (s && s.type === 'bot' && s.difficulty && DIFFICULTIES.has(s.difficulty)) {
      return { type: 'bot' as const, difficulty: s.difficulty }
    }
    throw new HttpError(400, 'Svako mesto je "human" ili "bot" (easy/medium/hard)')
  })
  if (!seats.some((s) => s.type === 'human')) throw new HttpError(400, 'Bar jedno mesto mora biti za tebe')
  return seats as SeatsConfig
}

/** RoomResult → HTTP odgovor (RPC greške nose status). */
function unwrap<T>(res: RoomResult<T>): Response {
  if (res.ok) return json(res.value)
  throw new HttpError(res.status, res.message)
}
