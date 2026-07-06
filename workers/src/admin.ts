// ─────────────────────────────────────────────────────────────
// Interni admin API (/api/admin/*) za dashboard: statistika korišćenja,
// lista partija/igrača i drill-down do svakog poteza (debug).
// Zaštita: Bearer ADMIN_TOKEN (secret) — bez tokena API se ponaša kao da ne postoji.
// ─────────────────────────────────────────────────────────────
import type {
  AdminActionRow,
  AdminGameDetail,
  AdminGameListItem,
  AdminGamePlayer,
  AdminHandRow,
  AdminPlayer,
  AdminPlayersResponse,
  AdminStats,
} from '../../src/protocol/admin.ts'
import type { GameStatus } from '../../src/protocol/messages.ts'
import type { GameState, KontraLevel, Seat, Trip } from '../../src/engine/index.ts'
import { HttpError, json } from './http.ts'

const enc = new TextEncoder()

const STATUSES: GameStatus[] = ['lobby', 'active', 'finished', 'abandoned']
/** aktivna partija = promena u poslednjih 10 minuta */
const ACTIVE_WINDOW_MS = 10 * 60_000
const DAILY_DAYS = 30

export async function handleAdmin(request: Request, env: Env, path: string): Promise<Response> {
  // bez podešenog tokena admin API "ne postoji" (produkcija bez secreta = ništa ne curi)
  if (!env.ADMIN_TOKEN) throw new HttpError(404, 'Nije pronađeno')
  await requireAdmin(request, env.ADMIN_TOKEN)
  if (request.method !== 'GET') throw new HttpError(404, 'Nije pronađeno')

  const url = new URL(request.url)
  if (path === '/api/admin/ping') return json({ ok: true })
  if (path === '/api/admin/stats') return stats(env)
  if (path === '/api/admin/games') return listGames(env, url)
  if (path === '/api/admin/players') return listPlayers(env, url)

  const game = path.match(/^\/api\/admin\/games\/([A-Za-z0-9]{6})$/)
  if (game) return gameDetail(env, game[1].toUpperCase())

  throw new HttpError(404, 'Nije pronađeno')
}

/** Poređenje tokena u konstantnom vremenu (SHA-256 izjednačava dužine). */
async function requireAdmin(request: Request, secret: string): Promise<void> {
  const header = request.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Potreban admin token')
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(secret)),
  ])
  if (!crypto.subtle.timingSafeEqual(a, b)) throw new HttpError(401, 'Pogrešan admin token')
}

// ── /stats ──

async function stats(env: Env): Promise<Response> {
  const now = new Date()
  const dayCutoff = new Date(now.getTime() - (DAILY_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
  const activeCutoff = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString()

  const [byStatus, players, registered, hands, activeNow, created, finished, contracts, countries] = await env.DB.batch([
    env.DB.prepare('SELECT status, COUNT(*) AS c FROM games GROUP BY status'),
    env.DB.prepare('SELECT COUNT(DISTINCT user_id) AS c FROM game_players WHERE user_id IS NOT NULL'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM players WHERE email IS NOT NULL'),
    env.DB.prepare('SELECT COUNT(*) AS c FROM hands'),
    env.DB.prepare("SELECT COUNT(*) AS c FROM games WHERE status = 'active' AND updated_at >= ?").bind(activeCutoff),
    env.DB.prepare(
      'SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS c FROM games WHERE created_at >= ? GROUP BY d',
    ).bind(dayCutoff),
    env.DB.prepare(
      'SELECT substr(finished_at, 1, 10) AS d, COUNT(*) AS c FROM games WHERE finished_at IS NOT NULL AND finished_at >= ? GROUP BY d',
    ).bind(dayCutoff),
    env.DB.prepare(
      'SELECT contract, as_igra, COUNT(*) AS c, SUM(passed) AS p FROM hands GROUP BY contract, as_igra ORDER BY c DESC',
    ),
    env.DB.prepare('SELECT country, COUNT(*) AS c FROM players GROUP BY country ORDER BY c DESC'),
  ])

  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<GameStatus, number>
  for (const row of byStatus.results as { status: string; c: number }[]) {
    if ((STATUSES as string[]).includes(row.status)) statusCounts[row.status as GameStatus] = row.c
  }

  const createdBy = new Map((created.results as { d: string; c: number }[]).map((r) => [r.d, r.c]))
  const finishedBy = new Map((finished.results as { d: string; c: number }[]).map((r) => [r.d, r.c]))
  const daily: AdminStats['daily'] = []
  for (let i = DAILY_DAYS - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    daily.push({ date, created: createdBy.get(date) ?? 0, finished: finishedBy.get(date) ?? 0 })
  }

  const body: AdminStats = {
    generatedAt: now.toISOString(),
    totals: {
      games: STATUSES.reduce((sum, s) => sum + statusCounts[s], 0),
      byStatus: statusCounts,
      players: (players.results[0] as { c: number }).c,
      registered: (registered.results[0] as { c: number }).c,
      hands: (hands.results[0] as { c: number }).c,
      activeNow: (activeNow.results[0] as { c: number }).c,
    },
    daily,
    contracts: (contracts.results as { contract: string; as_igra: number; c: number; p: number | null }[]).map(
      (r) => ({ contract: r.contract, asIgra: r.as_igra === 1, count: r.c, passed: r.p ?? 0 }),
    ),
    countries: (countries.results as { country: string | null; c: number }[]).map((r) => ({
      country: r.country,
      players: r.c,
    })),
  }
  return json(body)
}

// ── /games ──

interface GameRow {
  code: string
  status: string
  phase: string | null
  hand_no: number
  version: number
  summary: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  updated_at: string
}

interface PlayerRow {
  code: string
  seat: number
  user_id: string | null
  display_name: string
  is_bot: number
  bot_difficulty: string | null
  registered: number
}

function toListItem(g: GameRow, players: PlayerRow[]): AdminGameListItem {
  return {
    code: g.code,
    status: g.status as GameStatus,
    phase: g.phase,
    handNo: g.hand_no,
    version: g.version,
    players: players.map(
      (p): AdminGamePlayer => ({
        seat: p.seat as Seat,
        displayName: p.display_name,
        isBot: p.is_bot === 1,
        botDifficulty: p.bot_difficulty,
        userId: p.user_id,
        registered: p.registered === 1,
      }),
    ),
    createdAt: g.created_at,
    startedAt: g.started_at,
    finishedAt: g.finished_at,
    updatedAt: g.updated_at,
    summary: g.summary ? (JSON.parse(g.summary) as { scores: Trip<number> }) : null,
  }
}

async function playersFor(env: Env, codes: string[]): Promise<PlayerRow[]> {
  if (codes.length === 0) return []
  const res = await env.DB.prepare(
    `SELECT gp.code, gp.seat, gp.user_id, gp.display_name, gp.is_bot, gp.bot_difficulty,
       (pl.email IS NOT NULL) AS registered
     FROM game_players gp LEFT JOIN players pl ON pl.user_id = gp.user_id
     WHERE gp.code IN (${codes.map(() => '?').join(',')}) ORDER BY gp.code, gp.seat`,
  )
    .bind(...codes)
    .all<PlayerRow>()
  return res.results
}

async function listGames(env: Env, url: URL): Promise<Response> {
  const status = url.searchParams.get('status') ?? ''
  if (status && !(STATUSES as string[]).includes(status)) throw new HttpError(400, 'Nepoznat status')
  const q = (url.searchParams.get('q') ?? '').trim()
  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25)
  const offset = clampInt(url.searchParams.get('offset'), 0, 100_000, 0)

  // filter: status + slobodna pretraga (kod partije, ime igrača ili userId — dovoljan je prefiks,
  // u tabelama se prikazuje skraćeni ID)
  const where = `WHERE (?1 = '' OR status = ?1)
    AND (?2 = '' OR code LIKE ?3 OR EXISTS (
      SELECT 1 FROM game_players gp WHERE gp.code = games.code
        AND (gp.display_name LIKE ?4 OR gp.user_id LIKE ?5)))`
  const binds = [status, q, `${q.toUpperCase()}%`, `%${q}%`, `${q}%`]

  const [total, games] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS c FROM games ${where}`).bind(...binds),
    env.DB.prepare(
      `SELECT code, status, phase, hand_no, version, summary, created_at, started_at, finished_at, updated_at
       FROM games ${where} ORDER BY updated_at DESC LIMIT ?6 OFFSET ?7`,
    ).bind(...binds, limit, offset),
  ])

  const rows = games.results as GameRow[]
  const players = await playersFor(env, rows.map((g) => g.code))
  return json({
    total: (total.results[0] as { c: number }).c,
    games: rows.map((g) => toListItem(g, players.filter((p) => p.code === g.code))),
  })
}

async function gameDetail(env: Env, code: string): Promise<Response> {
  const game = await env.DB.prepare(
    `SELECT code, status, phase, hand_no, version, summary, created_at, started_at, finished_at, updated_at
     FROM games WHERE code = ?`,
  )
    .bind(code)
    .first<GameRow>()
  if (!game) throw new HttpError(404, 'Partija nije pronađena')

  const [players, hands] = await Promise.all([
    playersFor(env, [code]),
    env.DB.prepare(
      `SELECT hand_no, declarer_seat, declarer_name, contract, as_igra, kontra, passed, played_at
       FROM hands WHERE code = ? ORDER BY hand_no`,
    )
      .bind(code)
      .all<{
        hand_no: number
        declarer_seat: number
        declarer_name: string
        contract: string
        as_igra: number
        kontra: number
        passed: number
        played_at: string
      }>(),
  ])

  const dump = await env.GAME_ROOM.getByName(code).adminDump()
  const body: AdminGameDetail = {
    game: toListItem(game, players),
    hands: hands.results.map(
      (h): AdminHandRow => ({
        handNo: h.hand_no,
        declarerSeat: h.declarer_seat as Seat,
        declarerName: h.declarer_name,
        contract: h.contract,
        asIgra: h.as_igra === 1,
        kontra: h.kontra as KontraLevel,
        passed: h.passed === 1,
        playedAt: h.played_at,
      }),
    ),
    // RPC deep-clone gubi tuple tipove (Trip<T> → T[]) — vraćamo ih kastom
    live: dump.meta
      ? {
          state: dump.state as GameState | null,
          actions: dump.actions as AdminActionRow[],
          connectedSeats: dump.connectedSeats,
        }
      : null,
  }
  return json(body)
}

// ── /players ──

async function listPlayers(env: Env, url: URL): Promise<Response> {
  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 25)
  const offset = clampInt(url.searchParams.get('offset'), 0, 100_000, 0)

  const [total, players] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS c FROM players'),
    env.DB.prepare(
      `SELECT p.user_id, p.display_name, p.email, p.country, p.city, p.first_seen, p.last_seen,
        (SELECT COUNT(*) FROM game_players gp WHERE gp.user_id = p.user_id) AS games_played,
        (SELECT COUNT(*) FROM game_players gp JOIN games g ON g.code = gp.code
          WHERE gp.user_id = p.user_id AND g.status = 'finished') AS games_finished,
        (SELECT COUNT(*) FROM hands h WHERE h.declarer_user_id = p.user_id) AS hands_declared
       FROM players p ORDER BY games_played DESC, p.last_seen DESC LIMIT ? OFFSET ?`,
    ).bind(limit, offset),
  ])

  interface Row {
    user_id: string
    display_name: string
    email: string | null
    country: string | null
    city: string | null
    first_seen: string
    last_seen: string
    games_played: number
    games_finished: number
    hands_declared: number
  }
  const rows = players.results as Row[]
  const wins = await winsFor(env, rows.map((r) => r.user_id))

  const body: AdminPlayersResponse = {
    total: (total.results[0] as { c: number }).c,
    players: rows.map(
      (r): AdminPlayer => ({
        userId: r.user_id,
        displayName: r.display_name,
        email: r.email,
        country: r.country,
        city: r.city,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        gamesPlayed: r.games_played,
        gamesFinished: r.games_finished,
        wins: wins.get(r.user_id) ?? 0,
        handsDeclared: r.hands_declared,
      }),
    ),
  }
  return json(body)
}

/** Pobede po igraču: najbolji finalScore u završenoj partiji (summary JSON iz D1). */
async function winsFor(env: Env, userIds: string[]): Promise<Map<string, number>> {
  const wins = new Map<string, number>()
  if (userIds.length === 0) return wins

  const res = await env.DB.prepare(
    `SELECT g.summary, gp.user_id, gp.seat FROM games g
     JOIN game_players gp ON gp.code = g.code
     WHERE g.status = 'finished' AND g.summary IS NOT NULL
       AND gp.user_id IN (${userIds.map(() => '?').join(',')})`,
  )
    .bind(...userIds)
    .all<{ summary: string; user_id: string; seat: number }>()

  for (const row of res.results) {
    try {
      const { scores } = JSON.parse(row.summary) as { scores: Trip<number> }
      if (scores[row.seat as Seat] === Math.max(...scores)) {
        wins.set(row.user_id, (wins.get(row.user_id) ?? 0) + 1)
      }
    } catch {
      /* pokvaren summary — preskoči */
    }
  }
  return wins
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
