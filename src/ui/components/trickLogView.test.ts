import { describe, expect, it } from 'vitest'
import type { PlayedCard } from '@engine'
import { orderedTrickCards } from './trickLogView'

describe('orderedTrickCards', () => {
  it('drži štih karte u fiksnim kolonama levo/sredina/desno nezavisno od redosleda igranja', () => {
    const cards: PlayedCard[] = [
      { seat: 0, card: { suit: 'karo', rank: '7' } },
      { seat: 2, card: { suit: 'pik', rank: 'A' } },
      { seat: 1, card: { suit: 'herc', rank: '10' } },
    ]

    expect(orderedTrickCards(cards, [2, 0, 1])).toEqual([
      { suit: 'pik', rank: 'A' },
      { suit: 'karo', rank: '7' },
      { suit: 'herc', rank: '10' },
    ])
  })

  it('ostavlja praznu kolonu dok igrač još nije odigrao kartu', () => {
    const cards: PlayedCard[] = [
      { seat: 2, card: { suit: 'pik', rank: 'A' } },
      { seat: 0, card: { suit: 'karo', rank: '7' } },
    ]

    expect(orderedTrickCards(cards, [2, 0, 1])).toEqual([
      { suit: 'pik', rank: 'A' },
      { suit: 'karo', rank: '7' },
      undefined,
    ])
  })
})
