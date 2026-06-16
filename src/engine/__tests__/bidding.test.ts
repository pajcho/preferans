import { describe, it, expect } from 'vitest'
import {
  newBidding,
  applyPass,
  applyRaise,
  applyHold,
  applyIgra,
  biddingOutcome,
  legalBidOptions,
  firstBidder,
  biddingOrder,
} from '../bidding'

describe('bidding — redosled', () => {
  it('forehand je desno od delioca; redosled kreće od njega', () => {
    expect(firstBidder(0)).toBe(1)
    expect(biddingOrder(0)).toEqual([1, 2, 0])
    expect(biddingOrder(2)).toEqual([0, 1, 2])
  })

  it('svi „dalje" → allpass (refe)', () => {
    let b = newBidding(0)
    b = applyPass(b)
    b = applyPass(b)
    b = applyPass(b)
    expect(biddingOutcome(b).status).toBe('allpass')
  })

  it('jedan diže pa dva „dalje" → won na 2', () => {
    let b = newBidding(0)
    b = applyRaise(b, 2)
    b = applyPass(b)
    b = applyPass(b)
    const o = biddingOutcome(b)
    expect(o.status).toBe('won')
    if (o.status === 'won') {
      expect(o.declarer).toBe(1)
      expect(o.wonLevel).toBe(2)
      expect(o.igra).toBe(false)
    }
  })

  it('diže se STROGO korak po korak (samo sledeći nivo)', () => {
    let b = newBidding(0)
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 2 })
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'RAISE', level: 3 })
    b = applyRaise(b, 2)
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 3 })
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'RAISE', level: 4 })
  })
})

describe('bidding — prvenstvo („mogu")', () => {
  it('raniji igrač „mogu" zadrži nivo i pobedi', () => {
    // order [1,2,0]: seat1=forehand (najveće prvenstvo)
    let b = newBidding(0)
    b = applyRaise(b, 2) // seat1 → 2
    b = applyRaise(b, 3) // seat2 → 3
    b = applyPass(b) // seat0 dalje
    expect(legalBidOptions(b)).toContainEqual({ type: 'HOLD' }) // seat1 ima prvenstvo nad seat2
    b = applyHold(b) // seat1 drži 3
    b = applyPass(b) // seat2 ne diže → dalje
    const o = biddingOutcome(b)
    expect(o.status).toBe('won')
    if (o.status === 'won') {
      expect(o.declarer).toBe(1)
      expect(o.wonLevel).toBe(3)
    }
  })

  it('kasniji igrač NEMA „mogu" (mora da diže)', () => {
    let b = newBidding(0)
    b = applyRaise(b, 2) // seat1 holder
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'HOLD' }) // seat2 kasniji
  })
})

describe('bidding — „igra" (bez talona)', () => {
  it('na prvom potezu se sme „igra", jača od talona; pobedi kao igra', () => {
    let b = newBidding(0)
    b = applyRaise(b, 2) // seat1 talon-2
    expect(legalBidOptions(b)).toContainEqual({ type: 'IGRA', level: 2 }) // seat2 prvi put
    b = applyIgra(b, 2) // seat2 igra-2
    b = applyPass(b) // seat0 dalje
    b = applyPass(b) // seat1 dalje (talonom ne može preko igre)
    const o = biddingOutcome(b)
    expect(o.status).toBe('won')
    if (o.status === 'won') {
      expect(o.declarer).toBe(2)
      expect(o.igra).toBe(true)
    }
  })

  it('u „igra" modu nema talon-raise', () => {
    let b = newBidding(0)
    b = applyRaise(b, 2)
    b = applyIgra(b, 2)
    expect(legalBidOptions(b).some((o) => o.type === 'RAISE')).toBe(false)
  })
})
