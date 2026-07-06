// ─────────────────────────────────────────────────────────────
// Tipovi admin API-ja (interni dashboard /admin) — deli ih worker
// (workers/src/admin.ts) i klijent (src/net/admin.ts).
// Svi endpointi traže Bearer ADMIN_TOKEN; vidi docs/ADMIN.md.
// ─────────────────────────────────────────────────────────────
import type { Action, Config, GameState, KontraLevel, Seat, Trip } from '../engine/index.ts'
import type { GameStatus } from './messages.ts'

/** Zapis u DO logu poteza: engine Action + sintetički INIT (podela na startu partije). */
export type LoggedAction = Action | { type: 'INIT'; seed: number; config: Config }

/** GET /api/admin/stats — brojke za pregled. */
export interface AdminStats {
  generatedAt: string
  totals: {
    games: number
    byStatus: Record<GameStatus, number>
    /** jedinstveni ljudi (anonimni user_id) koji su seli za sto */
    players: number
    /** koliko njih ima nalog (email + lozinka) */
    registered: number
    hands: number
    /** aktivne partije sa promenom u poslednjih 10 min */
    activeNow: number
  }
  /** poslednjih 30 dana, uključujući dane bez ijedne partije */
  daily: { date: string; created: number; finished: number }[]
  /** šta se igra: pik/karo/herc/tref/betl/sans (+ „igra" varijante), sa brojem padova */
  contracts: { contract: string; asIgra: boolean; count: number; passed: number }[]
  countries: { country: string | null; players: number }[]
}

export interface AdminPlayer {
  userId: string
  displayName: string
  /** email naloga; null = anoniman igrač */
  email: string | null
  country: string | null
  city: string | null
  firstSeen: string
  lastSeen: string
  gamesPlayed: number
  gamesFinished: number
  /** najbolji finalScore u završenoj partiji (deli se kod izjednačenja) */
  wins: number
  /** koliko puta je bio nosilac igre */
  handsDeclared: number
}

export interface AdminPlayersResponse {
  total: number
  players: AdminPlayer[]
}

export interface AdminGamePlayer {
  seat: Seat
  displayName: string
  isBot: boolean
  botDifficulty: string | null
  userId: string | null
  /** čovek sa nalogom (false za botove i anonimne) */
  registered: boolean
}

export interface AdminGameListItem {
  code: string
  status: GameStatus
  phase: string | null
  handNo: number
  version: number
  players: AdminGamePlayer[]
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  updatedAt: string
  summary: { scores: Trip<number> } | null
}

/** GET /api/admin/games?status=&q=&limit=&offset= */
export interface AdminGamesResponse {
  total: number
  games: AdminGameListItem[]
}

export interface AdminHandRow {
  handNo: number
  declarerSeat: Seat
  declarerName: string
  contract: string
  asIgra: boolean
  kontra: KontraLevel
  passed: boolean
  playedAt: string
}

export interface AdminActionRow {
  seq: number
  handNo: number
  seat: Seat | null
  action: LoggedAction
  at: string
}

/** GET /api/admin/games/:code — D1 meta + (ako partija živi u DO) pun state i log poteza. */
export interface AdminGameDetail {
  game: AdminGameListItem
  hands: AdminHandRow[]
  /** null kad partija nije u DO storage-u (npr. seed podaci) */
  live: {
    state: GameState | null
    actions: AdminActionRow[]
    /** sedišta čiji su igrači trenutno na WebSocket-u */
    connectedSeats: Seat[]
  } | null
}
