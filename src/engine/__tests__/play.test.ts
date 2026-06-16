import { describe, it, expect } from 'vitest'
import { legalCards, trickWinner } from '../play'
import { cardId } from '../deck'
import type { Card, PlayedCard, Suit, Rank } from '../types'

const C = (suit: Suit, rank: Rank): Card => ({ suit, rank })

describe('legalCards', () => {
  it('vodeći igrač sme bilo šta', () => {
    const hand = [C('pik', 'A'), C('herc', '7')]
    expect(legalCards(hand, [], 'tref')).toHaveLength(2)
  })

  it('mora da prati traženu boju', () => {
    const hand = [C('pik', '7'), C('herc', 'A')]
    const trick: PlayedCard[] = [{ seat: 0, card: C('pik', 'K') }]
    expect(legalCards(hand, trick, 'tref').map(cardId)).toEqual(['pik:7'])
  })

  it('nema boju → mora adut', () => {
    const hand = [C('tref', '7'), C('herc', 'A')]
    const trick: PlayedCard[] = [{ seat: 0, card: C('pik', 'K') }]
    expect(legalCards(hand, trick, 'tref').map(cardId)).toEqual(['tref:7'])
  })

  it('nema ni boju ni adut → bilo šta', () => {
    const hand = [C('herc', 'A'), C('karo', '7')]
    const trick: PlayedCard[] = [{ seat: 0, card: C('pik', 'K') }]
    expect(legalCards(hand, trick, 'tref')).toHaveLength(2)
  })

  it('sans (bez aduta): nema boju → bilo šta', () => {
    const hand = [C('herc', 'A'), C('karo', '7')]
    const trick: PlayedCard[] = [{ seat: 0, card: C('pik', 'K') }]
    expect(legalCards(hand, trick, null)).toHaveLength(2)
  })

  it('mustOvertrump: mora jači adut ako može', () => {
    const hand = [C('tref', '8'), C('tref', 'A')]
    const trick: PlayedCard[] = [
      { seat: 0, card: C('pik', 'K') },
      { seat: 1, card: C('tref', '10') },
    ]
    expect(legalCards(hand, trick, 'tref', { mustOvertrump: true }).map(cardId)).toEqual(['tref:A'])
  })
})

describe('trickWinner', () => {
  it('najjača tražene boje kad nema aduta odigranog', () => {
    const cards: PlayedCard[] = [
      { seat: 0, card: C('pik', 'K') },
      { seat: 1, card: C('pik', 'A') },
      { seat: 2, card: C('herc', 'A') },
    ]
    expect(trickWinner(cards, 'tref').seat).toBe(1)
  })

  it('adut nosi štih', () => {
    const cards: PlayedCard[] = [
      { seat: 0, card: C('pik', 'A') },
      { seat: 1, card: C('tref', '7') },
      { seat: 2, card: C('pik', 'K') },
    ]
    expect(trickWinner(cards, 'tref').seat).toBe(1)
  })

  it('viši adut nosi nad nižim', () => {
    const cards: PlayedCard[] = [
      { seat: 0, card: C('tref', '9') },
      { seat: 1, card: C('tref', 'J') },
      { seat: 2, card: C('tref', '8') },
    ]
    expect(trickWinner(cards, 'tref').seat).toBe(1)
  })
})
