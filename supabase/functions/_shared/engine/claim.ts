import type { Card, ClaimInfo, PlayedCard, Seat, Suit, Trip } from './types.ts'
import { SUITS } from './types.ts'
import { rankIndex } from './deck.ts'
import { right } from './bidding.ts'
import { legalCards, trickWinner } from './play.ts'

// Detekcija „forsiranog" ishoda: kad se ostatak ruke ne može promeniti nijednom igrom.
//  - adutska igra / sans: vodeći nosi SVE preostale štihove
//  - betl: nosioca NIKO ne može oboriti (nijedan preostali štih ne pada na njega)
// Sve provere su ZVUČNE (nikad lažno ne tvrde) — radije propuste slučaj nego pogreše.
//
// Brze (O(n)) zvučne provere rade na SVAKOM broju preostalih karata (gleda se pre svakog
// štiha); skupa rekurzija je eksponencijalna pa se zove samo u završnici (k ≤ RECURSE_CAP).

const MIN_REMAINING = 2
const RECURSE_CAP = 6

/** „Snaga" karte za poređenje (adut dobija +100 da uvek nadjača neadut). */
function power(c: Card, trump: Suit | null): number {
  return rankIndex(c.rank) + (trump && c.suit === trump ? 100 : 0)
}

/**
 * Vodeći nosi SVE: ako je njegova najslabija karta jača od najjače protivničke,
 * onda svaka njegova karta vodi svaki štih (adut nadjačava, a neadut-master ne može
 * biti odsečen jer protivnici nemaju jači adut). Brzo i zvučno.
 */
function leaderTakesAll(hands: Trip<Card[]>, leader: Seat, trump: Suit | null): boolean {
  const o1 = right(leader)
  const o2 = right(o1)
  let leaderMin = Infinity
  for (const c of hands[leader]) leaderMin = Math.min(leaderMin, power(c, trump))
  let oppMax = -Infinity
  for (const c of hands[o1]) oppMax = Math.max(oppMax, power(c, trump))
  for (const c of hands[o2]) oppMax = Math.max(oppMax, power(c, trump))
  return leaderMin > oppMax
}

/**
 * Betl „nema pad", BRZA zvučna provera (O(broj karata), radi na svakom k):
 *  (D) u SVAKOJ boji nosilac drži samo karte niže od obe protivničke u toj boji
 *      (dominacija) → prateći nikad ne uzima (karta mu je niža), pa kako D ostaje i
 *      posle vađenja karata, nosilac nijedan štih ne nosi kao pratilac;
 *  (L) ako je nosilac TRENUTNO na potezu (vodi), nijedna njegova boja ne sme biti
 *      „duplo prazna" kod protivnika — inače bi tim potezom poneo štih.
 * Posle prvog štiha nosioca uvek vodi protivnik (jer pod D nikad ne pobedi), pa nikad
 * više i ne izlazi → ne može da ponese. Promaši suptilne slučajeve (finese) — njih
 * hvata rekurzija u završnici.
 */
function sureBetlFast(hands: Trip<Card[]>, leader: Seat, declarer: Seat): boolean {
  const o1 = right(declarer)
  const o2 = right(o1)
  // (D) dominacija po bojama
  for (const suit of SUITS) {
    let decMax = -1
    for (const c of hands[declarer]) if (c.suit === suit) decMax = Math.max(decMax, rankIndex(c.rank))
    if (decMax < 0) continue // nosilac nema tu boju
    for (const c of hands[o1]) if (c.suit === suit && rankIndex(c.rank) <= decMax) return false
    for (const c of hands[o2]) if (c.suit === suit && rankIndex(c.rank) <= decMax) return false
  }
  // (L) ako nosilac vodi: nijedna njegova boja ne sme biti duplo prazna kod protivnika
  if (leader === declarer) {
    for (const c of hands[declarer]) {
      const o1Has = hands[o1].some((x) => x.suit === c.suit)
      const o2Has = hands[o2].some((x) => x.suit === c.suit)
      if (!o1Has && !o2Has) return false
    }
  }
  return true
}

function handsKey(hands: Trip<Card[]>, leader: Seat): string {
  return `${leader}|${hands.map((h) => h.map((c) => `${c.suit}${c.rank}`).sort().join(',')).join(';')}`
}

function without(hand: readonly Card[], c: Card): Card[] {
  const i = hand.findIndex((x) => x.suit === c.suit && x.rank === c.rank)
  const out = hand.slice()
  if (i >= 0) out.splice(i, 1)
  return out
}

/**
 * Betl: nosilac NE uzima nijedan preostali štih ni u jednoj liniji (čak ni ako sam
 * odigra najgore). Rekurzivno preko svih legalnih poteza, sa memoizacijom.
 * Ovo je namerno strože od “postoji dobra linija”, jer auto-finish bez potvrde ne
 * sme da ukloni legalan potez kojim igrač može da padne.
 */
function declarerDucksAll(
  hands: Trip<Card[]>,
  leader: Seat,
  declarer: Seat,
  memo: Map<string, boolean>,
): boolean {
  if (hands[leader].length === 0) return true
  const key = `${handsKey(hands, leader)}#${declarer}`
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  const o1 = right(leader)
  const o2 = right(o1)
  let ok = true
  outer: for (const c of hands[leader]) {
    const t0: PlayedCard[] = [{ seat: leader, card: c }]
    for (const d1 of legalCards(hands[o1], t0, null)) {
      const t1: PlayedCard[] = [...t0, { seat: o1, card: d1 }]
      for (const d2 of legalCards(hands[o2], t1, null)) {
        const t2: PlayedCard[] = [...t1, { seat: o2, card: d2 }]
        const w = trickWinner(t2, null).seat
        if (w === declarer) {
          ok = false
          break outer
        }
        const nh: Trip<Card[]> = [hands[0].slice(), hands[1].slice(), hands[2].slice()]
        nh[leader] = without(nh[leader], c)
        nh[o1] = without(nh[o1], d1)
        nh[o2] = without(nh[o2], d2)
        if (!declarerDucksAll(nh, w, declarer, memo)) {
          ok = false
          break outer
        }
      }
    }
  }
  memo.set(key, ok)
  return ok
}

/**
 * Vodeći nosi SVE: rekurzivno (hvata i slučajeve koje brza „power" provera promaši —
 * npr. master u boji gde su protivnici prazni, a nemaju adut da odseku). Zvučno:
 * traži da vodeći vodi svaki štih U SVAKOJ liniji (čak i ako sam odigra najgore).
 */
function leaderTakesAllRec(
  hands: Trip<Card[]>,
  leader: Seat,
  trump: Suit | null,
  memo: Map<string, boolean>,
): boolean {
  if (hands[leader].length === 0) return true
  const key = handsKey(hands, leader)
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  const o1 = right(leader)
  const o2 = right(o1)
  let ok = true
  outer: for (const c of hands[leader]) {
    const t0: PlayedCard[] = [{ seat: leader, card: c }]
    for (const d1 of legalCards(hands[o1], t0, trump)) {
      const t1: PlayedCard[] = [...t0, { seat: o1, card: d1 }]
      for (const d2 of legalCards(hands[o2], t1, trump)) {
        const t2: PlayedCard[] = [...t1, { seat: o2, card: d2 }]
        if (trickWinner(t2, trump).seat !== leader) {
          ok = false
          break outer
        }
        const nh: Trip<Card[]> = [hands[0].slice(), hands[1].slice(), hands[2].slice()]
        nh[leader] = without(nh[leader], c)
        nh[o1] = without(nh[o1], d1)
        nh[o2] = without(nh[o2], d2)
        if (!leaderTakesAllRec(nh, leader, trump, memo)) {
          ok = false
          break outer
        }
      }
    }
  }
  memo.set(key, ok)
  return ok
}

/**
 * Vraća forsiran ishod (i raspodelu preostalih štihova) ili null.
 * Poziva se kad vodeći treba da povede sledeći štih (sve ruke imaju po `k` karata).
 */
export function forcedOutcome(
  hands: Trip<Card[]>,
  leader: Seat,
  trump: Suit | null,
  isBetl: boolean,
  declarer: Seat,
): ClaimInfo | null {
  const k = hands[leader].length
  if (k < MIN_REMAINING) return null
  if (hands[0].length !== k || hands[1].length !== k || hands[2].length !== k) return null

  if (isBetl) {
    // brza zvučna provera (svaki k), pa rekurzija u završnici (hvata i finese)
    const sure =
      sureBetlFast(hands, leader, declarer) ||
      (k <= RECURSE_CAP && declarerDucksAll(hands, leader, declarer, new Map()))
    if (sure) {
      const add: Trip<number> = [0, 0, 0]
      add[right(declarer)] = k // ostatak ide protivnicima (nebitno za betl bodovanje)
      return { add, winner: null, reason: 'betl' }
    }
    return null
  }

  // brza „power" provera (svaki k), pa rekurzija u završnici (hvata više slučajeva)
  const takesAll =
    leaderTakesAll(hands, leader, trump) ||
    (k <= RECURSE_CAP && leaderTakesAllRec(hands, leader, trump, new Map()))
  if (takesAll) {
    const add: Trip<number> = [0, 0, 0]
    add[leader] = k
    return { add, winner: leader, reason: 'claim' }
  }
  return null
}
