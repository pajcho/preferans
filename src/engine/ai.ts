import type { Action, BidLevel, Card, Contract, Difficulty, GameState, PlayedCard, Seat, Suit } from './types'
import { SUITS } from './types'
import { rankIndex } from './deck'
import { SUIT_BID_VALUE, trumpOf } from './contract'
import { legalBidOptions, right } from './bidding'
import { legalCards, trickWinner } from './play'

// ─────────────────────────────────────────────────────────────
// Jednostavan AI protivnik. Čita SAMO svoju ruku + javno stanje.
// v1: heuristike. easy = slabije bidovanje + pasivno vođenje;
// medium/hard dele logiku (hard će kasnije dobiti dublju procenu).
// ─────────────────────────────────────────────────────────────

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 }

function suitLengths(cards: readonly Card[]): Record<Suit, number> {
  const l: Record<Suit, number> = { pik: 0, karo: 0, herc: 0, tref: 0 }
  for (const c of cards) l[c.suit]++
  return l
}

function suitHcp(cards: readonly Card[], suit: Suit): number {
  let h = 0
  for (const c of cards) if (c.suit === suit) h += HCP[c.rank] ?? 0
  return h
}

function handStrength(cards: readonly Card[]): number {
  let hcp = 0
  for (const c of cards) hcp += HCP[c.rank] ?? 0
  const lens = suitLengths(cards)
  const longest = Math.max(lens.pik, lens.karo, lens.herc, lens.tref)
  return hcp + Math.max(0, longest - 4) * 2
}

function sansStrength(cards: readonly Card[]): number {
  let score = handStrength(cards)
  for (const c of cards) {
    if (c.rank === 'A') score += 2
    if (c.rank === 'K') score += 1
  }
  return score
}

function betlStrength(cards: readonly Card[]): number {
  let score = 0
  for (const c of cards) {
    if (c.rank === '7') score += 3
    else if (c.rank === '8') score += 2
    else if (c.rank === '9') score += 1
    else if (c.rank === 'A') score -= 4
    else if (c.rank === 'K') score -= 3
    else if (c.rank === 'Q') score -= 1
  }
  const lens = suitLengths(cards)
  for (const n of Object.values(lens)) {
    if (n >= 5) score -= 2
    if (n === 1) score += 1
  }
  return score
}

/** Najbolja boja za adut među onima čija vrednost ≥ minValue. */
function bestSuit(cards: readonly Card[], minValue: number): Suit {
  const lens = suitLengths(cards)
  let best: Suit = 'tref'
  let bestScore = -Infinity
  for (const s of SUITS) {
    if (SUIT_BID_VALUE[s] < minValue) continue
    const score = lens[s] * 10 + suitHcp(cards, s)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

export function chooseAction(s: GameState, seat: Seat, diff: Difficulty = 'medium'): Action {
  switch (s.phase) {
    case 'bidding':
      return chooseBid(s, seat, diff)
    case 'talon':
      return chooseTalon(s, seat)
    case 'following':
      return chooseFollow(s, seat, diff)
    case 'kontra':
      return chooseKontra(s, seat, diff)
    case 'playing':
      return choosePlay(s, seat, diff)
    case 'handScored':
      return { type: 'NEXT_HAND' }
    default:
      throw new Error('[ai] nema poteza u ovoj fazi')
  }
}

function willingLevel(strength: number, diff: Difficulty): number {
  if (diff === 'easy') {
    return strength >= 20 ? 4 : strength >= 16 ? 3 : strength >= 11 ? 2 : 0
  }
  return strength >= 18 ? 5 : strength >= 15 ? 4 : strength >= 12 ? 3 : strength >= 9 ? 2 : 0
}

function willingBidLevel(cards: readonly Card[], diff: Difficulty): number {
  const suitLevel = willingLevel(handStrength(cards), diff)
  const sansLevel = sansStrength(cards) >= (diff === 'hard' ? 24 : 27) ? 7 : 0
  const betlLevel = betlStrength(cards) >= (diff === 'hard' ? 13 : 16) ? 6 : 0
  return Math.max(suitLevel, sansLevel, betlLevel)
}

function desiredIgraLevel(cards: readonly Card[], diff: Difficulty): number {
  const strength = handStrength(cards)
  const lens = suitLengths(cards)
  const bestSuitValue = Math.max(...SUITS.map((suit) => (lens[suit] >= 5 ? SUIT_BID_VALUE[suit] : 0)))
  if (sansStrength(cards) >= (diff === 'hard' ? 29 : 32)) return 7
  if (betlStrength(cards) >= (diff === 'hard' ? 17 : 20)) return 6
  if (strength >= (diff === 'hard' ? 21 : 24) && bestSuitValue > 0) return bestSuitValue
  return 0
}

function chooseBid(s: GameState, seat: Seat, diff: Difficulty): Action {
  const b = s.bidding
  if (!b) return { type: 'PASS', seat }
  const opts = legalBidOptions(b)
  const willing = willingBidLevel(s.hands[seat], diff)
  const desiredIgra = desiredIgraLevel(s.hands[seat], diff)
  const igra = opts
    .filter((o): o is { type: 'IGRA'; level: BidLevel } => o.type === 'IGRA')
    .filter((o) => o.level <= desiredIgra)
    .sort((a, b) => b.level - a.level)[0]
  if (igra) return { type: 'IGRA', seat, level: igra.level }

  // prvenstvo: ako možeš „mogu" da zadržiš nivo koji ti odgovara — zadrži (jeftinije)
  if (opts.some((o) => o.type === 'HOLD') && b.level !== null && b.level <= willing) {
    return { type: 'HOLD', seat }
  }
  const raise = opts.find((o): o is { type: 'RAISE'; level: BidLevel } => o.type === 'RAISE')
  if (raise && raise.level <= willing) return { type: 'RAISE', seat, level: raise.level }
  return { type: 'PASS', seat }
}

function chooseTalon(s: GameState, seat: Seat): Action {
  // „igra" (bez talona): odmah objavi adut kao igru
  if (s.wonAsIgra) {
    return { type: 'DECLARE', seat, contract: chooseContract(s.hands[seat], s.wonLevel ?? 2, true) }
  }
  // AI uvek uzme talon (ne najavljuje „igru" u v1)
  if (!s.talonTaken) return { type: 'TAKE_TALON', seat }
  if (s.hands[seat].length === 12) {
    const trump = bestSuit(s.hands[seat], Math.min(s.wonLevel ?? 2, 5))
    return { type: 'DISCARD', seat, cards: pickDiscards(s.hands[seat], trump) }
  }
  return { type: 'DECLARE', seat, contract: chooseContract(s.hands[seat], s.wonLevel ?? 2, false) }
}

function chooseContract(hand: readonly Card[], minLevel: number, asGame: boolean): Contract {
  if (minLevel >= 7) return { kind: 'sans', asGame }
  if (minLevel >= 6) {
    return sansStrength(hand) >= 27 && betlStrength(hand) < 17 ? { kind: 'sans', asGame } : { kind: 'betl', asGame }
  }
  if (minLevel <= 6 && betlStrength(hand) >= (asGame ? 18 : 15)) return { kind: 'betl', asGame }
  if (minLevel <= 7 && sansStrength(hand) >= (asGame ? 29 : 25)) return { kind: 'sans', asGame }
  const trump = bestSuit(hand, Math.min(minLevel, 5))
  return { kind: 'suit', trump, asGame }
}

function pickDiscards(hand: readonly Card[], trump: Suit): [Card, Card] {
  const sorted = hand.slice().sort((a, b) => discardScore(a, trump) - discardScore(b, trump))
  return [sorted[0], sorted[1]]
}
function discardScore(c: Card, trump: Suit): number {
  // niži score = pre se baca; čuvamo aduta i visoke karte
  return (c.suit === trump ? 100 : 0) + rankIndex(c.rank)
}

/** Gruba procena broja štihova koje ruka može da odbrani (aдути, asovi, dugi adut). */
function estimateDefTricks(hand: readonly Card[], trump: Suit | null): number {
  let t = 0
  for (const suit of SUITS) {
    const cs = hand.filter((c) => c.suit === suit)
    if (cs.length === 0) continue
    const ranks = cs.map((c) => c.rank)
    const isTrump = suit === trump
    if (ranks.includes('A')) t += isTrump ? 1 : 0.9
    if (ranks.includes('K')) t += cs.length >= 2 ? (isTrump ? 0.7 : 0.5) : 0.2
    if (isTrump && ranks.includes('Q') && cs.length >= 3) t += 0.3
    if (isTrump && cs.length >= 4) t += (cs.length - 3) * 0.4 // dug adut
  }
  return t
}

function chooseFollow(s: GameState, seat: Seat, diff: Difficulty): Action {
  const trump = s.contract ? trumpOf(s.contract) : null
  const est = estimateDefTricks(s.hands[seat], trump)
  // jedan branilac treba ~2 štiha; prati samo ako ruka realno može da pomogne (inače „ne dođem")
  const threshold = diff === 'easy' ? 1.2 : diff === 'hard' ? 1.9 : 1.6
  return { type: 'FOLLOW', seat, value: est >= threshold }
}

function chooseKontra(s: GameState, seat: Seat, diff: Difficulty): Action {
  const canRaise = s.kontra < 4
  if (!canRaise) return { type: 'PROCEED', seat }

  const isDeclarer = seat === s.declarer
  if (isDeclarer) {
    const confident =
      s.contract?.kind === 'betl'
        ? betlStrength(s.hands[seat]) >= (diff === 'hard' ? 16 : 19)
        : handStrength(s.hands[seat]) >= (diff === 'hard' ? 20 : 23)
    if (s.kontra > 0 && confident) return { type: 'KONTRA', seat }
    return { type: 'PROCEED', seat }
  }

  const trump = s.contract ? trumpOf(s.contract) : null
  const est = estimateDefTricks(s.hands[seat], trump)
  const defenders = s.declarer === null ? [] : ([right(s.declarer), right(right(s.declarer))] as Seat[])
  const activeDefenders = defenders.filter((d) => s.following[d])
  const canInvite =
    s.contract?.kind !== 'betl' &&
    s.kontra === 0 &&
    s.inviteCaller === null &&
    s.following[seat] &&
    activeDefenders.length === 1

  if (canInvite && est >= (diff === 'hard' ? 1.4 : 1.7)) return { type: 'INVITE', seat }
  if (est >= (diff === 'hard' ? 2.6 : 3.1)) return { type: 'KONTRA', seat }
  return { type: 'PROCEED', seat }
}

function choosePlay(s: GameState, seat: Seat, diff: Difficulty): Action {
  const trick = s.trick
  if (!trick) throw new Error('[ai] nema štiha')
  const trump = s.contract ? trumpOf(s.contract) : null
  const asc = legalCards(s.hands[seat], trick.cards, trump, s.config).sort(
    (a, b) => rankIndex(a.rank) - rankIndex(b.rank),
  )
  const low = asc[0]
  const high = asc[asc.length - 1]

  if (s.contract?.kind === 'betl') {
    const losing = asc.filter((c) => !wouldWinNow(trick.cards, seat, c, trump))
    if (seat === s.declarer) {
      // nosilac betla beži od štiha: baci najvišu koja gubi, inače uzmi najnižom
      return play(seat, losing.length ? losing[losing.length - 1] : low)
    }
    return play(seat, low)
  }

  if (trick.cards.length > 0) {
    const winners = asc.filter((c) => wouldWinNow(trick.cards, seat, c, trump))
    if (winners.length) return play(seat, winners[0]) // pobedi najjeftinije
    return play(seat, low) // baci najnižu
  }

  // vodimo štih
  return play(seat, diff === 'easy' ? low : high)
}

function wouldWinNow(
  trickCards: readonly PlayedCard[],
  seat: Seat,
  card: Card,
  trump: Suit | null,
): boolean {
  return trickWinner([...trickCards, { seat, card }], trump).seat === seat
}

function play(seat: Seat, card: Card): Action {
  return { type: 'PLAY', seat, card }
}
