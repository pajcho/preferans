import { describe, it, expect } from 'vitest'
import { forcedOutcome } from '../claim'
import { createGame, createGameWithHands, reduce } from '../reducer'
import { DEFAULT_CONFIG } from '../types'
import type { Card, Contract, GameState, Rank, Suit, Trip } from '../types'

const C = (suit: Suit, rank: Rank): Card => ({ suit, rank })

describe('forcedOutcome — „nosi sve" (adutska igra)', () => {
  it('vodeći ima sve najjače (adute) → nosi sve preostale štihove', () => {
    const hands: Trip<Card[]> = [
      [C('tref', 'A'), C('tref', 'K'), C('tref', 'Q')],
      [C('tref', 'J'), C('tref', '10'), C('herc', '7')],
      [C('tref', '9'), C('tref', '8'), C('herc', '8')],
    ]
    const r = forcedOutcome(hands, 0, 'tref', false, 0)
    expect(r).not.toBeNull()
    expect(r!.reason).toBe('claim')
    expect(r!.winner).toBe(0)
    expect(r!.add).toEqual([3, 0, 0])
  })

  it('NIJE forsirano ako protivnik ima jači adut', () => {
    const hands: Trip<Card[]> = [
      [C('tref', 'K'), C('tref', 'Q'), C('tref', 'J')],
      [C('tref', 'A'), C('tref', '10'), C('herc', '8')], // A tref
      [C('tref', '9'), C('tref', '8'), C('herc', '9')],
    ]
    expect(forcedOutcome(hands, 0, 'tref', false, 0)).toBeNull()
  })

  it('NIJE forsirano ako vodeći ima slabu neadutsku kartu (može biti odsečena)', () => {
    const hands: Trip<Card[]> = [
      [C('tref', 'A'), C('tref', 'K'), C('herc', '7')], // 7 herc je slaba
      [C('tref', '9'), C('tref', '8'), C('herc', 'A')],
      [C('tref', '10'), C('tref', 'J'), C('herc', '8')],
    ]
    expect(forcedOutcome(hands, 0, 'tref', false, 0)).toBeNull()
  })

  it('sans: vodeći ima mastere u bojama gde su protivnici prazni (rekurzija hvata)', () => {
    // sans (bez aduta); vodeći(0) ima A pik i 7 herc; protivnici prazni u pik i herc
    const hands: Trip<Card[]> = [
      [C('pik', 'A'), C('herc', '7')],
      [C('karo', 'K'), C('tref', 'K')],
      [C('karo', 'Q'), C('tref', 'Q')],
    ]
    const r = forcedOutcome(hands, 0, null, false, 0)
    expect(r).not.toBeNull()
    expect(r!.add).toEqual([2, 0, 0])
  })

  it('poslednji štih (k=1) se ne „klejmuje" (igra se normalno)', () => {
    const hands: Trip<Card[]> = [[C('tref', 'A')], [C('tref', 'K')], [C('tref', 'Q')]]
    expect(forcedOutcome(hands, 0, 'tref', false, 0)).toBeNull()
  })
})

describe('forcedOutcome — betl „nema pad"', () => {
  it('nosilac ima najniže karte → niko ne može da ga obori', () => {
    const hands: Trip<Card[]> = [
      [C('tref', '7'), C('tref', '8')],
      [C('tref', 'K'), C('tref', 'A')],
      [C('tref', '9'), C('tref', '10')],
    ]
    const r = forcedOutcome(hands, 0, null, true, 0)
    expect(r).not.toBeNull()
    expect(r!.reason).toBe('betl')
  })

  it('betl NIJE siguran ako nosilac ima visoku kartu (mora da uzme)', () => {
    const hands: Trip<Card[]> = [
      [C('tref', '7'), C('tref', 'A')], // A tref → uzeće štih
      [C('tref', 'K'), C('tref', '8')],
      [C('tref', '9'), C('tref', '10')],
    ]
    expect(forcedOutcome(hands, 0, null, true, 0)).toBeNull()
  })
})

describe('integracija — namešten siguran betl okida auto-završetak ODMAH', () => {
  it('IGRA → botovi pasiraju → igra-betl → „nema pad" pre prvog poteza', () => {
    // Ti (sedište 0): u svakoj boji najjača karta (≤9) niža od protivničke (≥10) → siguran betl.
    const hands: Trip<Card[]> = [
      [C('pik', '7'), C('pik', '8'), C('pik', '9'), C('karo', '7'), C('karo', '8'), C('karo', '9'), C('herc', '7'), C('herc', '8'), C('tref', '7'), C('tref', '8')],
      [C('pik', '10'), C('pik', 'J'), C('pik', 'Q'), C('pik', 'K'), C('pik', 'A'), C('karo', '10'), C('karo', 'J'), C('karo', 'Q'), C('karo', 'K'), C('karo', 'A')],
      [C('herc', '10'), C('herc', 'J'), C('herc', 'Q'), C('herc', 'K'), C('herc', 'A'), C('tref', '10'), C('tref', 'J'), C('tref', 'Q'), C('tref', 'K'), C('tref', 'A')],
    ]
    const talon: Card[] = [C('herc', '9'), C('tref', '9')]
    let g = createGameWithHands({ ...DEFAULT_CONFIG, startingBule: 40 }, 2, hands, talon)

    // licitacija: čovek kaže „igra", botovi pasiraju (kao u UI toku)
    g = reduce(g, { type: 'IGRA', seat: 0, level: 2 })
    g = reduce(g, { type: 'PASS', seat: 1 })
    g = reduce(g, { type: 'PASS', seat: 2 })
    expect(g.phase).toBe('talon')
    expect(g.wonAsIgra).toBe(true)

    // objava igra-betl → auto-završetak okine ODMAH (pre i jednog poteza)
    g = reduce(g, { type: 'DECLARE', seat: 0, contract: { kind: 'betl', asGame: true } })
    expect(g.phase).toBe('claim')
    expect(g.claim!.reason).toBe('betl')
    expect(g.tricksPlayed).toBe(0) // ne mora da se igra ništa
    expect(g.tricksWon[0]).toBe(0)

    // finalize → ruka se oboduje, betl prolazi
    g = reduce(g, { type: 'FINALIZE_CLAIM' })
    expect(['handScored', 'gameOver']).toContain(g.phase)
  })
})

describe('betl pad — kraj čim nosilac ponese štih (request 2)', () => {
  it('nosilac uzme štih → phase „claim" (betl-fail) → fiksna kazna', () => {
    const base = createGame({ ...DEFAULT_CONFIG, startingBule: 30 }, 1, 0)
    // ručno: faza igre, betl, štih koji nosilac (0) nosi sa herc A
    const playState: GameState = {
      ...base,
      phase: 'playing',
      declarer: 0,
      contract: { kind: 'betl', asGame: false } as Contract,
      following: [false, true, true],
      hands: [
        [C('pik', '7'), C('pik', '8')],
        [C('karo', '7'), C('karo', '8')],
        [C('tref', '7'), C('tref', '8')],
      ],
      trick: {
        leader: 0,
        cards: [
          { seat: 0, card: C('herc', 'A') },
          { seat: 1, card: C('herc', '7') },
          { seat: 2, card: C('herc', '8') },
        ],
      },
      tricksWon: [0, 0, 0],
      tricksPlayed: 0,
    }
    const after = reduce(playState, { type: 'RESOLVE_TRICK' })
    expect(after.phase).toBe('claim')
    expect(after.claim!.reason).toBe('betl-fail')
    expect(after.claim!.winner).toBe(0)

    const done = reduce(after, { type: 'FINALIZE_CLAIM' })
    expect(['handScored', 'gameOver']).toContain(done.phase)
    expect(done.tricksWon[0]).toBeGreaterThanOrEqual(1) // nosilac je poneo štih → pao
    // pratioci (1,2 prate) upisali supu protiv nosioca (betl pad = 60)
    expect(done.ledger.supe[1][0]).toBe(60)
    expect(done.ledger.supe[2][0]).toBe(60)
  })
})

describe('reduceFinalizeClaim — primena forsiranog ishoda', () => {
  it('dodaje preostale štihove vodećem i oboduje ruku', () => {
    const base = createGame({ ...DEFAULT_CONFIG, startingBule: 30 }, 1, 0)
    const claimState: GameState = {
      ...base,
      phase: 'claim',
      declarer: 0,
      contract: { kind: 'suit', trump: 'tref', asGame: false } as Contract,
      following: [false, true, true],
      kontra: 0,
      tricksWon: [4, 1, 1],
      tricksPlayed: 6,
      claim: { add: [3, 0, 0], winner: 0, reason: 'claim' },
    }
    const after = reduce(claimState, { type: 'FINALIZE_CLAIM' })
    expect(after.tricksWon).toEqual([7, 1, 1])
    expect(after.tricksPlayed).toBe(10)
    expect(['handScored', 'gameOver']).toContain(after.phase)
    // nosilac prošao (7 ≥ 6) → bule mu se smanjile (−tref)
    expect(after.ledger.bule[0]).toBeLessThan(base.ledger.bule[0])
    expect(after.claim).toBeNull()
  })
})
