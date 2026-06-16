import { describe, it, expect } from 'vitest'
import { createGame, reduce, currentActor, legalActions } from '../reducer'
import { redactFor } from '../playerView'
import { DEFAULT_CONFIG } from '../types'
import type { Card } from '../types'

// auto-finish isključen ovde da bi se odigrali svi štihovi (claim ima svoj test)
const cfg = { ...DEFAULT_CONFIG, startingBule: 30, mandatoryKontraOnPik: false, autoFinish: false }

describe('reducer — pun tok jedne ruke', () => {
  it('od deljenja do bodovanja, svih 10 štihova', () => {
    let s = createGame(cfg, 12345, 0)
    expect(s.phase).toBe('bidding')
    expect(s.hands[0]).toHaveLength(10)
    expect(s.talon).toHaveLength(2)

    // forehand = desno od delioca(0) = 1; otvori 2, ostali "dalje" → nosilac 1
    expect(currentActor(s)).toBe(1)
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 })
    s = reduce(s, { type: 'PASS', seat: 2 })
    s = reduce(s, { type: 'PASS', seat: 0 })
    expect(s.phase).toBe('talon')
    expect(s.declarer).toBe(1)
    expect(s.bidLog).toEqual([
      { seat: 1, kind: 'raise', level: 2 },
      { seat: 2, kind: 'pass' },
      { seat: 0, kind: 'pass' },
    ])

    // uzmi talon, baci 2, prijavi pik
    s = reduce(s, { type: 'TAKE_TALON', seat: 1 })
    expect(s.hands[1]).toHaveLength(12)
    const toss = s.hands[1].slice(0, 2) as [Card, Card]
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss })
    expect(s.hands[1]).toHaveLength(10)
    expect(s.discard).toHaveLength(2)
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'pik', asGame: false } })
    expect(s.phase).toBe('following')

    // oba pratioca prate → kontra-runda
    s = reduce(s, { type: 'FOLLOW', seat: currentActor(s)!, value: true })
    s = reduce(s, { type: 'FOLLOW', seat: currentActor(s)!, value: true })
    expect(s.phase).toBe('kontra')
    // jedan branilac da kontru, nosilac ne rekontrira
    const def = currentActor(s)!
    s = reduce(s, { type: 'KONTRA', seat: def })
    expect(s.kontra).toBe(1)
    expect(currentActor(s)).toBe(s.declarer)
    s = reduce(s, { type: 'PROCEED' })
    expect(s.phase).toBe('playing')
    expect(s.kontra).toBe(1)

    // odigraj sve štihove (prva legalna karta)
    let guard = 0
    while (s.phase === 'playing' && guard++ < 80) {
      if (s.trick && s.trick.cards.length === 3) {
        s = reduce(s, { type: 'RESOLVE_TRICK' })
        continue
      }
      const plays = legalActions(s).filter((a) => a.type === 'PLAY')
      expect(plays.length).toBeGreaterThan(0)
      s = reduce(s, plays[0])
    }

    expect(s.tricksPlayed).toBe(10)
    expect(s.tricksWon[0] + s.tricksWon[1] + s.tricksWon[2]).toBe(10)
    expect(['handScored', 'gameOver']).toContain(s.phase)
    expect(s.lastHand).not.toBeNull()
    expect(s.lastHand?.declarer).toBe(1)
    // sve karte odigrane
    expect(s.hands[0].length + s.hands[1].length + s.hands[2].length).toBe(0)
  })

  it('svi "dalje" → refe svima i novo deljenje (rotiran delilac)', () => {
    let s = createGame({ ...cfg, maxRefe: 2 }, 7, 0)
    s = reduce(s, { type: 'PASS', seat: 1 })
    s = reduce(s, { type: 'PASS', seat: 2 })
    s = reduce(s, { type: 'PASS', seat: 0 })
    expect(s.phase).toBe('bidding')
    expect(s.ledger.refe).toEqual([1, 1, 1])
    expect(s.dealer).toBe(1)
    expect(s.handNo).toBe(2)
  })
})

describe('playerView — skrivanje karata', () => {
  it('vidiš samo svoju ruku; za ostale samo broj', () => {
    const s = createGame(cfg, 99, 0)
    const v = redactFor(0, s)
    expect(v.hand).toHaveLength(10)
    expect(v.handCounts).toEqual([10, 10, 10])
    expect(v.talonCount).toBe(2)
    expect(v.talon).toHaveLength(0) // talon nije otkriven
    expect(v.yourTurn).toBe(currentActor(s) === 0)
  })
})
