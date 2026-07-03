// ─────────────────────────────────────────────────────────────
// Wire poruke klijent ↔ Cloudflare Worker/GameRoom DO (Faza 2 — online).
// VAŽNO: uvozi ga i worker (workers/src) — sme da importuje SAMO engine relativno.
// REST: auth/create/join/mine/view/cancel; WebSocket: view push + potezi.
// ─────────────────────────────────────────────────────────────
import type { Action, Difficulty, GameState, Seat } from '../engine/index.ts'

export type GameStatus = 'lobby' | 'active' | 'finished' | 'abandoned'

export type SeatConfig = { type: 'human' } | { type: 'bot'; difficulty: Difficulty }
export type SeatsConfig = [SeatConfig, SeatConfig, SeatConfig]

export interface PlayerInfo {
  seat: Seat
  displayName: string
  isBot: boolean
}

export interface GameMeta {
  code: string
  status: GameStatus
  version: number
  handNo: number
  phase: string | null
  currentActor: Seat | null
  startingBule: number
  seats: SeatsConfig
  players: PlayerInfo[]
  youAreCreator: boolean
  /** ISO timestamp početka partije (null u lobiju) */
  startedAt: string | null
}

/** Odgovor view/WS push: metapodaci + redigovan GameState (null u lobiju). */
export interface ViewResponse {
  game: GameMeta
  role: 'player' | 'spectator'
  mySeat: Seat | null
  state: GameState | null
}

/** POST /api/auth/anon — anonimni identitet (HMAC potpisan token, čuva se u localStorage). */
export interface AuthResponse {
  userId: string
  token: string
}

export interface CreateGameRequest {
  displayName: string
  seats: SeatsConfig
  startingBule?: number
}
export interface CreateGameResponse {
  code: string
  seat: Seat
  status: GameStatus
}

export interface JoinGameRequest {
  code: string
  displayName: string
}
export interface JoinGameResponse {
  code: string
  role: 'player' | 'spectator'
  seat: Seat | null
  status: GameStatus
}

/** Stavka liste „Moje partije" (GET /api/games/mine, iz D1). */
export interface MyGame {
  code: string
  status: GameStatus
  phase: string | null
  handNo: number
  currentActor: Seat | null
  updatedAt: string
  mySeat: Seat | null
  players: PlayerInfo[]
}

// ── WebSocket (wss://…/api/games/:code/ws?token=…) ──

/** Klijent → server. Potezi idu kroz WS; reqId veže ack/error za poziv. */
export type ClientMessage =
  | { type: 'act'; reqId: string; action: Action }
  | { type: 'sync' }

/** Server → klijent. Posle svake promene server gura redigovan view SVAKOM po njegovom sedištu. */
export type ServerMessage =
  | { type: 'view'; view: ViewResponse }
  | { type: 'presence'; seats: Seat[] }
  | { type: 'ack'; reqId: string }
  | { type: 'error'; reqId?: string; message: string }

export interface ApiError {
  error: string
  code?: string
}
