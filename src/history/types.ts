// engine se uvozi relativno (ne preko @engine aliasa) — radi i u klijentu i u
// worker build-u koji ne razrešava vite alias-e.
import type {
  BidEntry,
  Card,
  CompletedTrick,
  Contract,
  Difficulty,
  GameState,
  KontraLevel,
  Seat,
  Trip,
} from '../engine/index.ts'

export const GAME_HISTORY_SCHEMA_VERSION = 1

/** vs-cpu = svi protivnici botovi; online = bar jedan čovek za stolom */
export type GameHistoryMode = 'vs-cpu' | 'online'

export interface GameHistoryStanding {
  seat: Seat
  name: string
  score: number
  rank: number
}

export interface PlayedHistoryHand {
  kind: 'played'
  handNo: number
  dealer: Seat
  declarer: Seat
  contract: Contract
  kontra: KontraLevel
  kontraBy: Seat | null
  inviteCaller: Seat | null
  following: Trip<boolean>
  refeApplied: boolean
  tricksWon: Trip<number>
  initialHands: Trip<Card[]>
  passed: boolean
  buleDelta: Trip<number>
  supeDelta: Trip<Trip<number>>
  bidLog: BidEntry[]
  tricksLog: CompletedTrick[]
  talon: Card[]
  discard: Card[]
}

/** Prazna ruka — svi „dalje" (refe). Nema nosioca/ugovora/štihova. */
export interface RefeHistoryHand {
  kind: 'refe'
  handNo: number
  dealer: Seat
  initialHands: Trip<Card[]>
  talon: Card[]
  refeWritten: boolean
}

export type GameHistoryHand = PlayedHistoryHand | RefeHistoryHand

export interface GameHistoryRecord {
  schemaVersion: typeof GAME_HISTORY_SCHEMA_VERSION
  id: string
  mode: GameHistoryMode
  seed: number
  difficulty: Difficulty
  humanSeat: Seat
  playerNames: Trip<string>
  startedAt: number
  completedAt: number
  durationMs: number
  startingBule: number
  handCount: number
  finalLedger: GameState['ledger']
  scoreHistory: GameState['scoreHistory']
  finalScores: Trip<number>
  standings: GameHistoryStanding[]
  hands: GameHistoryHand[]
}

export type CompletedHandSource = Pick<
  GameState,
  'phase' | 'handNo' | 'dealer' | 'following' | 'bidLog' | 'tricksLog' | 'talon' | 'discard' | 'lastHand'
>

export type GameHistoryInput = {
  id: string
  game: GameState
  hands: GameHistoryHand[]
  difficulty: GameHistoryRecord['difficulty']
  humanSeat: Seat
  playerNames: Trip<string>
  startedAt: number
  completedAt: number
  /** default 'vs-cpu' */
  mode?: GameHistoryMode
}
