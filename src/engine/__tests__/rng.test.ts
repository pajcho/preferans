import { describe, it, expect } from 'vitest'
import { nextRandom, shuffle } from '../rng'
import { buildDeck, cardId } from '../deck'

describe('rng', () => {
  it('isti seed → isti rezultat', () => {
    const a = nextRandom(123)
    const b = nextRandom(123)
    expect(a.value).toBe(b.value)
    expect(a.state).toBe(b.state)
  })

  it('vrednosti su u [0, 1)', () => {
    let s = 1
    for (let i = 0; i < 200; i++) {
      const r = nextRandom(s)
      s = r.state
      expect(r.value).toBeGreaterThanOrEqual(0)
      expect(r.value).toBeLessThan(1)
    }
  })

  it('shuffle je deterministički i čuva sve karte', () => {
    const deck = buildDeck()
    const x = shuffle(deck, 42)
    const y = shuffle(deck, 42)
    expect(x.result.map(cardId)).toEqual(y.result.map(cardId))
    expect(new Set(x.result.map(cardId)).size).toBe(32)
    expect(x.result.map(cardId)).not.toEqual(deck.map(cardId)) // stvarno promešano
  })
})
