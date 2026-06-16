import type { BidLevel, BiddingState, Seat } from './types'

const MAX_LEVEL = 7

/** Sledeće sedište CCW (desno = +1). */
export function right(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat
}

/** Prvi licitira igrač desno od delioca (forehand). */
export function firstBidder(dealer: Seat): Seat {
  return right(dealer)
}

/** Redosled poteza od forehand-a (indeks 0 = najveće prvenstvo). */
export function biddingOrder(dealer: Seat): [Seat, Seat, Seat] {
  const f = firstBidder(dealer)
  return [f, right(f), right(right(f))]
}

export function newBidding(dealer: Seat): BiddingState {
  const order = biddingOrder(dealer)
  return { order, toAct: order[0], level: null, igra: false, holder: null, passed: [], acted: [] }
}

export type BidOption =
  | { type: 'PASS' }
  | { type: 'RAISE'; level: BidLevel }
  | { type: 'HOLD' }
  | { type: 'IGRA'; level: BidLevel }

function prio(b: BiddingState, seat: Seat): number {
  return b.order.indexOf(seat)
}

/** Igrač ima prvenstvo ako je raniji u redosledu od trenutnog držaoca. */
function hasPriority(b: BiddingState, seat: Seat): boolean {
  return b.holder !== null && prio(b, seat) < prio(b, b.holder)
}

/**
 * Legalne opcije za onoga ko je na potezu:
 *  - „dalje" (pas, trajno)
 *  - dizanje za jedan korak (RAISE), redom 2→7
 *  - „mogu" (HOLD) — samo ako imaš prvenstvo nad držaocem (zadržiš nivo bez dizanja)
 *  - „igra" (IGRA) — samo na prvom potezu, samo adutske igre (2..5), bez talona
 */
export function legalBidOptions(b: BiddingState): BidOption[] {
  const options: BidOption[] = [{ type: 'PASS' }]
  const seat = b.toAct

  if (b.holder !== null && b.holder !== seat && hasPriority(b, seat)) {
    options.push({ type: 'HOLD' })
  }

  if (b.igra) {
    // u „igra" modu: jedina nadigravanja su viša igra
    if (b.level !== null && b.level < 5) options.push({ type: 'IGRA', level: (b.level + 1) as BidLevel })
  } else {
    const next = (b.level === null ? 2 : b.level + 1) as BidLevel
    if (next <= MAX_LEVEL) options.push({ type: 'RAISE', level: next })
    if (!b.acted.includes(seat)) {
      const igraLevel = (b.level === null ? 2 : b.level) as BidLevel
      if (igraLevel <= 5) options.push({ type: 'IGRA', level: igraLevel })
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
  return { ...b, level, igra: false, holder: b.toAct, acted: withActed(b), toAct: nextActor(b, b.toAct, b.passed) }
}

export function applyHold(b: BiddingState): BiddingState {
  return { ...b, holder: b.toAct, acted: withActed(b), toAct: nextActor(b, b.toAct, b.passed) }
}

export function applyIgra(b: BiddingState, level: BidLevel): BiddingState {
  return { ...b, level, igra: true, holder: b.toAct, acted: withActed(b), toAct: nextActor(b, b.toAct, b.passed) }
}

export type BiddingOutcome =
  | { status: 'ongoing' }
  | { status: 'won'; declarer: Seat; wonLevel: BidLevel; igra: boolean }
  | { status: 'allpass' }

export function biddingOutcome(b: BiddingState): BiddingOutcome {
  if (b.passed.length === 3) return { status: 'allpass' }
  const active = b.order.filter((s) => !b.passed.includes(s))
  if (active.length === 1 && b.holder === active[0] && b.level !== null) {
    return { status: 'won', declarer: b.holder, wonLevel: b.level, igra: b.igra }
  }
  return { status: 'ongoing' }
}
