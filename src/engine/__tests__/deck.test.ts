import { describe, it, expect } from 'vitest'
import { buildDeck, rankIndex, cardId, sortHand } from '../deck'
import { SUITS, RANKS } from '../types'
import type { Card } from '../types'

describe('deck', () => {
  it('32 jedinstvene karte (4×8)', () => {
    const d = buildDeck()
    expect(d.length).toBe(32)
    expect(new Set(d.map(cardId)).size).toBe(32)
    expect(SUITS.length).toBe(4)
    expect(RANKS.length).toBe(8)
  })

  it('rang: 7 najslabiji, A najjači', () => {
    expect(rankIndex('7')).toBe(0)
    expect(rankIndex('A')).toBe(7)
    expect(rankIndex('K')).toBeLessThan(rankIndex('A'))
    expect(rankIndex('10')).toBeLessThan(rankIndex('J'))
  })

  it('sortHand sortira po boji pa po jačini', () => {
    const hand: Card[] = [
      { suit: 'tref', rank: '7' },
      { suit: 'pik', rank: 'A' },
      { suit: 'pik', rank: '8' },
    ]
    expect(sortHand(hand).map(cardId)).toEqual(['pik:8', 'pik:A', 'tref:7'])
  })
})
