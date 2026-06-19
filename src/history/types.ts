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
} from '@engine'

export const GAME_HISTORY_SCHEMA_VERSION = 1

export type GameHistoryMode = 'vs-cpu'

export interface GameHistoryStanding {
  seat: Seat
  name: string
  score: number
  rank: number
}

export interface GameHistoryHand {
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
  passed: boolean
  buleDelta: Trip<number>
  supeDelta: Trip<Trip<number>>
  bidLog: BidEntry[]
  tricksLog: CompletedTrick[]
  talon: Card[]
  discard: Card[]
}

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
  | 'phase'
  | 'handNo'
  | 'dealer'
  | 'following'
  | 'bidLog'
  | 'tricksLog'
  | 'talon'
  | 'discard'
  | 'lastHand'
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
}
