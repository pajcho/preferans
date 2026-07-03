import type { Card, GameState, Seat, Trip } from './types.ts'
import { currentActor } from './reducer.ts'

/**
 * Redigovan GameState za slanje klijentu (server autoritet, Faza 2):
 * sopstvena ruka ostaje, tuđe ruke postaju filler karte istog broja (samo za brojanje),
 * seed/rngState se brišu, talon i škart se kriju dok nisu javni po pravilima.
 * `seat === null` → posmatrač (sve ruke skrivene do otkrivanja).
 *
 * Otkrivanja: u fazi 'claim' sve ruke su otvorene (forsiran ishod se prikazuje);
 * u 'handScored'/'gameOver' ruka je gotova pa su ruke/talon javni (pregled ruke).
 */
export function redactStateFor(seat: Seat | null, s: GameState): GameState {
  const revealAll = s.phase === 'claim' || s.phase === 'handScored' || s.phase === 'gameOver'
  const filler = (n: number): Card[] => Array.from({ length: n }, () => ({ suit: 'pik', rank: '7' }) as Card)
  const redactHands = (hands: Trip<Card[]>): Trip<Card[]> =>
    hands.map((hand, i) =>
      revealAll || i === seat ? hand.map((c) => ({ ...c })) : filler(hand.length),
    ) as Trip<Card[]>

  const talonPublic =
    revealAll || (s.phase === 'talon' && !s.wonAsIgra && !s.talonTaken)
  const discardPublic = revealAll || (seat !== null && s.declarer === seat)

  return {
    ...s,
    seed: 0,
    rngState: 0,
    hands: redactHands(s.hands),
    initialHands: redactHands(s.initialHands),
    talon: talonPublic ? s.talon.map((c) => ({ ...c })) : [],
    discard: discardPublic ? s.discard.map((c) => ({ ...c })) : [],
  }
}

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
  talon: Card[] // javan u fazi talona i dok čeka potvrdu
  ledger: GameState['ledger']
  scoreHistory: GameState['scoreHistory']
  lastHand: GameState['lastHand']
  toAct: Seat | null
  yourTurn: boolean
}

export function redactFor(seat: Seat, s: GameState): PlayerView {
  const toAct = currentActor(s)
  const visibleTalon =
    s.talonReveal?.cards ??
    (s.phase === 'talon' && !s.wonAsIgra && !s.talonTaken ? s.talon : [])
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
    talonCount: s.talonReveal?.cards.length ?? s.talon.length,
    talon: [...visibleTalon],
    ledger: s.ledger,
    scoreHistory: s.scoreHistory,
    lastHand: s.lastHand,
    toAct,
    yourTurn: toAct === seat,
  }
}
