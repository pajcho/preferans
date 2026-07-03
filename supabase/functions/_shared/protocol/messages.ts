// ─────────────────────────────────────────────────────────────
// Wire poruke klijent ↔ edge funkcije (Faza 2 — online).
// VAŽNO: ovaj fajl se kopira u supabase/functions/_shared/protocol
// (scripts/sync-shared.sh) — sme da importuje SAMO engine relativno.
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
  id: string
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
}

/** Odgovor get-view/act: metapodaci + redigovan GameState (null u lobiju). */
export interface ViewResponse {
  game: GameMeta
  role: 'player' | 'spectator'
  mySeat: Seat | null
  state: GameState | null
}

export interface CreateGameRequest {
  displayName: string
  seats: SeatsConfig
  startingBule?: number
}
export interface CreateGameResponse {
  gameId: string
  code: string
  seat: Seat
  status: GameStatus
}

export interface JoinGameRequest {
  code: string
  displayName: string
}
export interface JoinGameResponse {
  gameId: string
  code: string
  role: 'player' | 'spectator'
  seat: Seat | null
  status: GameStatus
}

export interface GetViewRequest {
  gameId?: string
  code?: string
}

export interface ActRequest {
  gameId: string
  action: Action
}

export interface CancelGameRequest {
  gameId: string
}

/** Realtime broadcast payload na kanalu `game:{id}`, event `update`. */
export interface BroadcastUpdate {
  version: number
  status: GameStatus
  phase?: string | null
  actor?: Seat | null
  /** true kad se promenio sastav igrača (lobby join) */
  players?: boolean
}

export interface ApiError {
  error: string
  code?: string
}
