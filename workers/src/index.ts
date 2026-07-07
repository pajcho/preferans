// ─────────────────────────────────────────────────────────────
// Worker router: anonimni auth + REST (create/join/mine/view/cancel)
// + prosleđivanje WebSocket upgrade-a na GameRoom DO (ime DO-a = kod partije).
// ─────────────────────────────────────────────────────────────
import type {
  AbandonDecision,
  AbandonRequest,
  ConfigureGameRequest,
  CreateGameRequest,
  GameReplayResponse,
  HistoryGameItem,
  JoinGameRequest,
  LoginRequest,
  MyGame,
  RegisterRequest,
  SeatConfig,
  SeatsConfig,
  UpdateProfileRequest,
} from '../../src/protocol/messages.ts'
import type { Difficulty, Seat, Trip } from '../../src/engine/index.ts'
import { login, me, register, updateProfile } from './account.ts'
import { handleAdmin } from './admin.ts'
import { issueIdentity, verifyToken } from './auth.ts'
import { HttpError, allowedOrigin, cleanName, corsHeaders, json, withCors } from './http.ts'
import { upsertPlayer } from './players.ts'
import { generateCode } from './random.ts'
import type { RoomResult } from './room.ts'

export { GameRoom } from './room.ts'

const CODE_RE = /^[A-Z0-9]{6}$/
const DIFFICULTIES = new Set<Difficulty>(['easy', 'medium', 'hard'])
const ABANDON_DECISIONS = new Set<AbandonDecision>(['propose', 'agree', 'reject', 'withdraw'])

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env.ALLOWED_ORIGINS, origin) })
    }
    try {
      return withCors(await route(request, env, ctx), env.ALLOWED_ORIGINS, origin)
    } catch (e) {
      if (e instanceof HttpError) {
        return withCors(json({ error: e.message }, e.status), env.ALLOWED_ORIGINS, origin)
      }
      console.error('[worker] neočekivana greška:', e)
      return withCors(json({ error: 'Interna greška servera' }, 500), env.ALLOWED_ORIGINS, origin)
    }
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === '/' && request.method === 'GET') {
    return json({ ok: true, service: 'prefa-backend' })
  }
  if (path === '/api/auth/anon' && request.method === 'POST') {
    return json(await issueIdentity(env.AUTH_SECRET))
  }
  if (path === '/api/auth/register' && request.method === 'POST') {
    const userId = await requireUser(request, env)
    return register(request, env, userId, await readJson<RegisterRequest>(request))
  }
  if (path === '/api/auth/login' && request.method === 'POST') {
    return login(env, await readJson<LoginRequest>(request))
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    return me(env, await requireUser(request, env))
  }
  if (path === '/api/auth/profile' && request.method === 'POST') {
    const userId = await requireUser(request, env)
    return updateProfile(env, userId, await readJson<UpdateProfileRequest>(request))
  }
  if (path.startsWith('/api/admin/')) {
    return handleAdmin(request, env, path)
  }
  if (path === '/api/games' && request.method === 'POST') {
    return createGame(request, env, ctx)
  }
  if (path === '/api/games/join' && request.method === 'POST') {
    return joinGame(request, env, ctx)
  }
  if (path === '/api/games/mine' && request.method === 'GET') {
    return myGames(request, env)
  }
  if (path === '/api/games/history' && request.method === 'GET') {
    return gameHistory(request, env)
  }

  const match = path.match(
    /^\/api\/games\/([A-Za-z0-9]{6})\/(ws|view|cancel|abandon|debug|config|start|leave|replay|hands)$/,
  )
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
      case 'abandon': {
        if (request.method !== 'POST') break
        const userId = await requireUser(request, env)
        const body = await readJson<AbandonRequest>(request)
        if (!body || !ABANDON_DECISIONS.has(body.decision)) throw new HttpError(400, 'Neispravna odluka o prekidu')
        return unwrap(await stub.abandon(userId, body.decision))
      }
      case 'config': {
        if (request.method !== 'POST') break
        const userId = await requireUser(request, env)
        const patch = validateConfigure(await readJson<ConfigureGameRequest>(request))
        return unwrap(await stub.configure(userId, patch))
      }
      case 'start': {
        if (request.method !== 'POST') break
        const userId = await requireUser(request, env)
        return unwrap(await stub.start(userId))
      }
      case 'leave': {
        if (request.method !== 'POST') break
        const userId = await requireUser(request, env)
        return unwrap(await stub.leave(userId))
      }
      case 'replay': {
        if (request.method !== 'GET') break
        return gameReplay(request, env, code)
      }
      case 'hands': {
        // završene ruke (rekonstrukcija na serveru) — puni „Prethodne ruke" posle reload-a;
        // isti pristup kao /view (bilo koji autentifikovan korisnik sa kodom, uklj. posmatrače)
        if (request.method !== 'GET') break
        await requireUser(request, env)
        return unwrap(await stub.handsView())
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

async function createGame(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const userId = await requireUser(request, env)
  const body = await readJson<CreateGameRequest>(request)

  // ime je opciono (anonimni identitet je pravi ID) — server dodeli placeholder,
  // a NE gazi već poznato ime; kad igrač kasnije ukuca ime, istorija ga pokaže retroaktivno
  const displayName = await resolveDisplayName(env, userId, body.displayName)
  upsertPlayer(request, env, ctx, userId, displayName)
  // default: kreator + 2 slobodna mesta — mesta i pravila se podešavaju u lobiju
  const seats =
    body.seats === undefined
      ? ([{ type: 'human' }, { type: 'human' }, { type: 'human' }] as SeatsConfig)
      : validateSeats(body.seats)
  const startingBule =
    Number.isInteger(body.startingBule) && body.startingBule! >= 10 && body.startingBule! <= 400
      ? body.startingBule!
      : 100
  const maxRefe =
    Number.isInteger(body.maxRefe) && body.maxRefe! >= 0 && body.maxRefe! <= 10 ? body.maxRefe! : 2

  // retry na (malo verovatan) sudar koda — DO sa postojećom partijom odbija create
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode()
    const stub = env.GAME_ROOM.getByName(code)
    const res = await stub.create({ code, createdBy: userId, displayName, seats, startingBule, maxRefe })
    if (res.ok) return json(res.value)
    if (res.message !== 'code-collision') throw new HttpError(res.status, res.message)
  }
  throw new HttpError(500, 'Neuspešno generisanje koda partije')
}

async function joinGame(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const userId = await requireUser(request, env)
  const body = await readJson<JoinGameRequest>(request)
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!CODE_RE.test(code)) throw new HttpError(400, 'Neispravan kod partije')
  const displayName = await resolveDisplayName(env, userId, body.displayName)
  upsertPlayer(request, env, ctx, userId, displayName)

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

/** Istorija: ZAVRŠENE i PREKINUTE (posle starta) partije u kojima pozivalac sedi. */
async function gameHistory(request: Request, env: Env): Promise<Response> {
  const userId = await requireUser(request, env)
  // prekinute u lobiju (started_at IS NULL) se ne prikazuju — nikad nisu ni počele
  const games = await env.DB.prepare(
    `SELECT g.code, g.status, g.hand_no, g.summary, g.started_at, g.finished_at
     FROM games g JOIN game_players p ON p.code = g.code
     WHERE p.user_id = ?
       AND (g.status = 'finished' OR (g.status = 'abandoned' AND g.started_at IS NOT NULL))
     ORDER BY COALESCE(g.finished_at, g.updated_at) DESC LIMIT 50`,
  )
    .bind(userId)
    .all<{ code: string; status: string; hand_no: number; summary: string | null; started_at: string | null; finished_at: string | null }>()

  const players = await historyPlayers(env, games.results.map((g) => g.code))
  const list: HistoryGameItem[] = games.results.map((g) => {
    const ps = players.filter((p) => p.code === g.code)
    return {
      code: g.code,
      status: g.status === 'abandoned' ? 'abandoned' : 'finished',
      handCount: g.hand_no,
      startedAt: g.started_at,
      finishedAt: g.finished_at,
      mySeat: (ps.find((p) => p.userId === userId)?.seat ?? null) as Seat | null,
      players: ps.map((p) => ({ seat: p.seat as Seat, displayName: p.displayName, isBot: p.isBot })),
      scores: g.summary ? (JSON.parse(g.summary) as { scores: Trip<number> }).scores : null,
    }
  })
  return json(list)
}

/** Pun log ZAVRŠENE partije za rekonstrukciju istorije (samo učesnik). */
async function gameReplay(request: Request, env: Env, code: string): Promise<Response> {
  const userId = await requireUser(request, env)
  const game = await env.DB.prepare('SELECT status, starting_bule, started_at, finished_at FROM games WHERE code = ?')
    .bind(code)
    .first<{ status: string; starting_bule: number; started_at: string | null; finished_at: string | null }>()
  if (!game) throw new HttpError(404, 'Partija nije pronađena')

  // učesnika proveravamo PRE statusa — ne otkrivamo strancima ni da partija postoji/traje
  const players = await historyPlayers(env, [code])
  const me = players.find((p) => p.userId === userId)
  if (!me) throw new HttpError(403, 'Nisi igrao u ovoj partiji')
  if (game.status !== 'finished' && game.status !== 'abandoned') throw new HttpError(409, 'Partija nije završena')

  const res = await env.GAME_ROOM.getByName(code).replayLog()
  if (!res.ok) throw new HttpError(res.status, res.message)

  const body: GameReplayResponse = {
    code,
    mySeat: me.seat as Seat,
    players: players.map((p) => ({ seat: p.seat as Seat, displayName: p.displayName, isBot: p.isBot, botDifficulty: p.botDifficulty })),
    startingBule: game.starting_bule,
    startedAt: game.started_at,
    finishedAt: game.finished_at,
    // RPC deep-clone gubi tuple tipove ([Card,Card] → Card[]) — vraćamo ih kastom
    actions: res.value.actions as GameReplayResponse['actions'],
  }
  return json(body)
}

/** Igrači partije sa TRENUTNIM imenom (players.display_name), fallback na snapshot iz game_players. */
async function historyPlayers(
  env: Env,
  codes: string[],
): Promise<{ code: string; seat: number; userId: string | null; isBot: boolean; botDifficulty: Difficulty | null; displayName: string }[]> {
  if (codes.length === 0) return []
  const res = await env.DB.prepare(
    `SELECT gp.code, gp.seat, gp.user_id, gp.is_bot, gp.bot_difficulty,
       COALESCE(pl.display_name, gp.display_name) AS display_name
     FROM game_players gp LEFT JOIN players pl ON pl.user_id = gp.user_id
     WHERE gp.code IN (${codes.map(() => '?').join(',')}) ORDER BY gp.code, gp.seat`,
  )
    .bind(...codes)
    .all<{ code: string; seat: number; user_id: string | null; is_bot: number; bot_difficulty: string | null; display_name: string }>()
  return res.results.map((r) => ({
    code: r.code,
    seat: r.seat,
    userId: r.user_id,
    isBot: r.is_bot === 1,
    botDifficulty: r.bot_difficulty as Difficulty | null,
    displayName: r.display_name,
  }))
}

// ── pomoćno ──

/** Ime za sto: prosleđeno (očišćeno) → već poznato iz profila → placeholder „Gost-XXXX".
 *  Nikad ne gazi postojeće pravo ime placeholderom (ime je opciono, userId je pravi ID). */
async function resolveDisplayName(env: Env, userId: string, raw: unknown): Promise<string> {
  if (typeof raw === 'string' && raw.trim()) return cleanName(raw)
  const existing = await env.DB.prepare('SELECT display_name FROM players WHERE user_id = ?')
    .bind(userId)
    .first<{ display_name: string }>()
  return existing?.display_name ?? `Gost-${userId.slice(0, 4).toUpperCase()}`
}

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

function validateSeat(s: unknown): SeatConfig {
  const cfg = s as { type?: string; difficulty?: Difficulty } | null
  if (cfg && cfg.type === 'human') return { type: 'human' }
  if (cfg && cfg.type === 'bot' && cfg.difficulty && DIFFICULTIES.has(cfg.difficulty)) {
    return { type: 'bot', difficulty: cfg.difficulty }
  }
  throw new HttpError(400, 'Svako mesto je "human" ili "bot" (easy/medium/hard)')
}

function validateSeats(raw: unknown): SeatsConfig {
  if (!Array.isArray(raw) || raw.length !== 3) throw new HttpError(400, 'Konfiguracija mora imati tačno 3 mesta')
  const seats = raw.map(validateSeat)
  if (!seats.some((s) => s.type === 'human')) throw new HttpError(400, 'Bar jedno mesto mora biti za tebe')
  return seats as SeatsConfig
}

/** Validacija POST /api/games/:code/config — svako polje opciono, ali ispravno. */
function validateConfigure(raw: ConfigureGameRequest): ConfigureGameRequest {
  const patch: ConfigureGameRequest = {}
  if (raw.seat !== undefined || raw.seatConfig !== undefined) {
    if (!Number.isInteger(raw.seat) || raw.seat! < 0 || raw.seat! > 2) {
      throw new HttpError(400, 'Mesto mora biti 0, 1 ili 2')
    }
    patch.seat = raw.seat
    patch.seatConfig = validateSeat(raw.seatConfig)
  }
  if (raw.startingBule !== undefined) {
    if (!Number.isInteger(raw.startingBule) || raw.startingBule < 10 || raw.startingBule > 400) {
      throw new HttpError(400, 'Bule: ceo broj od 10 do 400')
    }
    patch.startingBule = raw.startingBule
  }
  if (raw.maxRefe !== undefined) {
    if (!Number.isInteger(raw.maxRefe) || raw.maxRefe < 0 || raw.maxRefe > 10) {
      throw new HttpError(400, 'Refe: ceo broj od 0 do 10')
    }
    patch.maxRefe = raw.maxRefe
  }
  if (patch.seat === undefined && patch.startingBule === undefined && patch.maxRefe === undefined) {
    throw new HttpError(400, 'Prazna izmena')
  }
  return patch
}

/** RoomResult → HTTP odgovor (RPC greške nose status). */
function unwrap<T>(res: RoomResult<T>): Response {
  if (res.ok) return json(res.value)
  throw new HttpError(res.status, res.message)
}
