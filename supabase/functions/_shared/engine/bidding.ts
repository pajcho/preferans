import type { BidLevel, BiddingState, Seat } from './types.ts'

const MAX_LEVEL = 7

/** Sledeće sedište CCW (desno = +1). */
export function right(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat
}

/** Prvi licitira igrač desno od delioca (forehand). */
export function firstBidder(dealer: Seat): Seat {
  return right(dealer)
}

/** Redosled poteza od forehand-a. */
export function biddingOrder(dealer: Seat): [Seat, Seat, Seat] {
  const f = firstBidder(dealer)
  return [f, right(f), right(right(f))]
}

export function newBidding(dealer: Seat): BiddingState {
  const order = biddingOrder(dealer)
  return { order, toAct: order[0], level: null, igra: false, holder: null, awaitingHold: false, passed: [], acted: [] }
}

export type BidOption =
  | { type: 'PASS' }
  | { type: 'RAISE'; level: BidLevel }
  | { type: 'HOLD' }
  | { type: 'IGRA'; level: BidLevel }

/**
 * Legalne opcije za onoga ko je na potezu:
 *  - „dalje" (pas, trajno)
 *  - dizanje za jedan korak (RAISE), redom 2→7
 *  - „moje" (HOLD) — preuzimanje nivoa posle dizanja na 3+
 *  - „igra" (IGRA) — samo na prvom javljanju; može do betla/sansa, bez talona
 */
export function legalBidOptions(b: BiddingState): BidOption[] {
  const options: BidOption[] = []
  const seat = b.toAct
  const firstTurn = !b.acted.includes(seat)

  if (b.igra) {
    options.push({ type: 'PASS' })
    // u „igra" modu: nadigravanje je konkretna viša igra (isti nivo ostaje prvom koji je rekao)
    const start = (b.level ?? 1) + 1
    for (let level = start; level <= MAX_LEVEL; level += 1) {
      options.push({ type: 'IGRA', level: level as BidLevel })
    }
  } else if (b.awaitingHold) {
    options.push({ type: 'PASS' })
    // Posle dizanja na 3+ sledeći aktivni igrač može da preuzme nivo ili da kaže „dalje".
    // Dok se to ne razreši, ne može da digne sledeći nivo.
    if (firstTurn) {
      const start = b.level ?? 3
      for (let level = start; level <= MAX_LEVEL; level += 1) {
        options.push({ type: 'IGRA', level: level as BidLevel })
      }
    }
    options.push({ type: 'HOLD' })
  } else {
    options.push({ type: 'PASS' })
    const next = (b.level === null ? 2 : b.level + 1) as BidLevel
    if (next <= MAX_LEVEL) options.push({ type: 'RAISE', level: next })
    if (firstTurn) {
      const start = b.level === null ? 2 : b.level
      for (let level = start; level <= MAX_LEVEL; level += 1) {
        options.push({ type: 'IGRA', level: level as BidLevel })
      }
    }
  }
  return options
}

function nextActor(b: BiddingState, justActed: Seat, passedNow: readonly Seat[]): Seat {
  const i = b.order.indexOf(justActed)
  for (let k = 1; k <= 3; k++) {
    const s = b.order[(i + k) % 3]
    if (!passedNow.includes(s)) return s
  }
  return justActed
}

const withActed = (b: BiddingState): Seat[] =>
  b.acted.includes(b.toAct) ? b.acted : [...b.acted, b.toAct]

export function applyPass(b: BiddingState): BiddingState {
  const passed = [...b.passed, b.toAct]
  return { ...b, passed, toAct: nextActor(b, b.toAct, passed) }
}

export function applyRaise(b: BiddingState, level: BidLevel): BiddingState {
  return {
    ...b,
    level,
    igra: false,
    holder: b.toAct,
    awaitingHold: level >= 3,
    acted: withActed(b),
    toAct: nextActor(b, b.toAct, b.passed),
  }
}

export function applyHold(b: BiddingState): BiddingState {
  return { ...b, holder: b.toAct, awaitingHold: false, acted: withActed(b), toAct: nextActor(b, b.toAct, b.passed) }
}

export function applyIgra(b: BiddingState, level: BidLevel): BiddingState {
  return {
    ...b,
    level,
    igra: true,
    holder: b.toAct,
    awaitingHold: false,
    acted: withActed(b),
    toAct: nextActor(b, b.toAct, b.passed),
  }
}

export type BiddingOutcome =
  | { status: 'ongoing' }
  | { status: 'won'; declarer: Seat; wonLevel: BidLevel; igra: boolean }
  | { status: 'allpass' }

export function biddingOutcome(b: BiddingState): BiddingOutcome {
  if (b.passed.length === 3) return { status: 'allpass' }
  if (!b.igra && b.level === MAX_LEVEL && !b.awaitingHold && b.holder !== null) {
    return { status: 'won', declarer: b.holder, wonLevel: b.level, igra: false }
  }
  const active = b.order.filter((s) => !b.passed.includes(s))
  if (active.length === 1 && b.holder === active[0] && b.level !== null) {
    return { status: 'won', declarer: b.holder, wonLevel: b.level, igra: b.igra }
  }
  return { status: 'ongoing' }
}
