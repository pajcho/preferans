import { describe, it, expect } from 'vitest'
import { scoreHand, finalScore } from '../scoring'
import type { HandOutcome } from '../scoring'
import type { Contract } from '../types'

const TREF: Contract = { kind: 'suit', trump: 'tref', asGame: false }

const outcome = (over: Partial<HandOutcome>): HandOutcome => ({
  contract: TREF,
  declarer: 0,
  following: [false, true, true],
  inviteCaller: null,
  kontra: 0,
  kontraBy: null,
  refeApplies: false,
  supaCap5: true,
  tricksWon: [6, 2, 2],
  ...over,
})

describe('scoreHand — adutske igre', () => {
  it('tref prošao (6 štihova): nosilac −10, pratioci po 20', () => {
    const d = scoreHand(outcome({}))
    expect(d.bule[0]).toBe(-10)
    expect(d.supe[1][0]).toBe(20)
    expect(d.supe[2][0]).toBe(20)
  })

  it('tref pao (5 štihova): nosilac +10, supe po broju štihova', () => {
    const d = scoreHand(outcome({ tricksWon: [5, 3, 2] }))
    expect(d.bule[0]).toBe(10)
    expect(d.supe[1][0]).toBe(30) // 3×5×2
    expect(d.supe[2][0]).toBe(20) // 2×5×2
  })

  it('kontra duplira sve', () => {
    const d = scoreHand(outcome({ kontra: 1, kontraBy: 1 }))
    expect(d.bule[0]).toBe(-20)
    expect(d.supe[1][0]).toBe(80)
    expect(d.supe[2][0]).toBe(0)
  })

  it('refe duplira sve', () => {
    const d = scoreHand(outcome({ refeApplies: true }))
    expect(d.bule[0]).toBe(-20)
    expect(d.supe[1][0]).toBe(40)
  })

  it('pik (B=2) prošao: −4', () => {
    const d = scoreHand(
      outcome({ contract: { kind: 'suit', trump: 'pik', asGame: false }, tricksWon: [7, 2, 1] }),
    )
    expect(d.bule[0]).toBe(-4)
    expect(d.supe[1][0]).toBe(8) // 2×2×2
    expect(d.supe[2][0]).toBe(4) // 1×2×2
  })

  it('pratilac koji ne prati ne piše supe', () => {
    const d = scoreHand(outcome({ following: [false, true, false], tricksWon: [6, 4, 0] }))
    expect(d.supe[1][0]).toBe(40)
    expect(d.supe[2][0]).toBe(0)
  })

  it('pratilac sa manje od 2 štiha pada u bule, ali ruka je obračunata do kraja', () => {
    const d = scoreHand(outcome({ tricksWon: [6, 3, 1] }))
    expect(d.bule[0]).toBe(-10)
    expect(d.bule[1]).toBe(0)
    expect(d.bule[2]).toBe(10)
    expect(d.supe[1][0]).toBe(30)
    expect(d.supe[2][0]).toBe(10)
  })

  it('supe cap 5 ograničava samo obračun para, ne broj odigranih štihova', () => {
    const d = scoreHand(outcome({ tricksWon: [4, 4, 2] }))
    expect(d.bule[0]).toBe(10)
    expect(d.supe[1][0] + d.supe[2][0]).toBe(50) // 5×5×2
  })

  it('bez supe cap-a pratioci pišu sve odnesene štihove', () => {
    const d = scoreHand(outcome({ supaCap5: false, tricksWon: [4, 4, 2] }))
    expect(d.supe[1][0]).toBe(40)
    expect(d.supe[2][0]).toBe(20)
  })

  it('pozivalac piše zajedničke supe i pada ako par ne uhvati 4', () => {
    const d = scoreHand(outcome({ following: [false, true, true], inviteCaller: 1, tricksWon: [7, 2, 1] }))
    expect(d.bule[1]).toBe(10)
    expect(d.bule[2]).toBe(0)
    expect(d.supe[1][0]).toBe(30)
    expect(d.supe[2][0]).toBe(0)
  })
})

describe('scoreHand — betl', () => {
  const BETL: Contract = { kind: 'betl', asGame: false }
  it('betl prošao (0 štihova): nosilac −12, bez supa', () => {
    const d = scoreHand(outcome({ contract: BETL, tricksWon: [0, 5, 5] }))
    expect(d.bule[0]).toBe(-12)
    expect(d.supe[1][0]).toBe(0)
  })
  it('betl pao: nosilac +12, pratioci po 60', () => {
    const d = scoreHand(outcome({ contract: BETL, tricksWon: [1, 5, 4] }))
    expect(d.bule[0]).toBe(12)
    expect(d.supe[1][0]).toBe(60)
    expect(d.supe[2][0]).toBe(60)
  })
  it('kontra na betl: ako nosilac prođe, pada samo igrač koji je kontrirao', () => {
    const d = scoreHand(outcome({ contract: BETL, kontra: 1, kontraBy: 1, tricksWon: [0, 5, 5] }))
    expect(d.bule[0]).toBe(-24)
    expect(d.bule[1]).toBe(24)
    expect(d.bule[2]).toBe(0)
  })
  it('igra-betl pao: +14, pratioci po 70', () => {
    const d = scoreHand(outcome({ contract: { kind: 'betl', asGame: true }, tricksWon: [1, 5, 4] }))
    expect(d.bule[0]).toBe(14)
    expect(d.supe[1][0]).toBe(70)
  })
})

describe('scoreHand — sans', () => {
  it('sans (B=7) prošao: −14, supe 14/štih-par', () => {
    const d = scoreHand(outcome({ contract: { kind: 'sans', asGame: false }, tricksWon: [6, 2, 2] }))
    expect(d.bule[0]).toBe(-14)
    expect(d.supe[1][0]).toBe(28) // 2×7×2
  })
})

describe('finalScore — ispod nule je bolje', () => {
  it('dobar rezultat (prošao + supe)', () => {
    expect(finalScore(-10, 40, 0)).toBe(-140) // -40 + 0 + (-100)
  })
  it('loš rezultat (pao, supe protiv tebe)', () => {
    expect(finalScore(5, 0, 30)).toBe(80) // 0 + 30 + 50
  })
})
