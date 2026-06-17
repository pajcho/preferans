import type { Card, GameState, Seat } from './types'
import { currentActor } from './reducer'

/**
 * Redaktovan pogled za jedno sedište — vidi SAMO svoju ruku; za ostale samo broj karata.
 * Isti princip kasnije radi redakciju preko Supabase (Faza 2/3).
 */
export interface PlayerView {
  seat: Seat
  phase: GameState['phase']
  hand: Card[]
  handCounts: [number, number, number]
  dealer: Seat
  declarer: Seat | null
  contract: GameState['contract']
  wonLevel: GameState['wonLevel']
  bidding: GameState['bidding']
  bidLog: GameState['bidLog']
  following: GameState['following']
  followToAct: Seat | null
  kontra: GameState['kontra']
  trick: GameState['trick']
  tricksLog: GameState['tricksLog']
  tricksWon: GameState['tricksWon']
  tricksPlayed: number
  talonCount: number
  talon: Card[] // vidljiv samo kad je otkriven (nosiocu); inače prazan
  ledger: GameState['ledger']
  scoreHistory: GameState['scoreHistory']
  lastHand: GameState['lastHand']
  toAct: Seat | null
  yourTurn: boolean
}

export function redactFor(seat: Seat, s: GameState): PlayerView {
  const toAct = currentActor(s)
  // talon je javan tek kad ga nosilac otkrije; do tad ga niko ne vidi
  const talonVisible = s.talonTaken === false && s.declarer === seat && s.phase === 'talon'
  return {
    seat,
    phase: s.phase,
    hand: [...s.hands[seat]],
    handCounts: [s.hands[0].length, s.hands[1].length, s.hands[2].length],
    dealer: s.dealer,
    declarer: s.declarer,
    contract: s.contract,
    wonLevel: s.wonLevel,
    bidding: s.bidding,
    bidLog: s.bidLog,
    following: s.following,
    followToAct: s.followToAct,
    kontra: s.kontra,
    trick: s.trick,
    tricksLog: s.tricksLog,
    tricksWon: s.tricksWon,
    tricksPlayed: s.tricksPlayed,
    talonCount: s.talon.length,
    talon: talonVisible ? [...s.talon] : [],
    ledger: s.ledger,
    scoreHistory: s.scoreHistory,
    lastHand: s.lastHand,
    toAct,
    yourTurn: toAct === seat,
  }
}
