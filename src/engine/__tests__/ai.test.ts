import { describe, it, expect } from 'vitest'
import { createGame, reduce, currentActor, activeSeatCount } from '../reducer'
import { chooseAction } from '../ai'
import { DEFAULT_CONFIG } from '../types'
import type { Difficulty, GameState } from '../types'

function playFullGame(seed: number, diff: Difficulty): GameState {
  let s = createGame({ ...DEFAULT_CONFIG, startingBule: 6, mandatoryKontraOnPik: false }, seed, 0)
  let guard = 0
  while (s.phase !== 'gameOver' && guard++ < 8000) {
    if (s.phase === 'handScored') {
      s = reduce(s, { type: 'NEXT_HAND' })
      continue
    }
    if (s.phase === 'playing' && s.trick && s.trick.cards.length === activeSeatCount(s)) {
      s = reduce(s, { type: 'RESOLVE_TRICK' })
      continue
    }
    if (s.phase === 'claim') {
      s = reduce(s, { type: 'FINALIZE_CLAIM' })
      continue
    }
    const actor = currentActor(s)
    if (actor === null) break
    s = reduce(s, chooseAction(s, actor, diff))
  }
  return s
}

describe('AI — 3 bota odigraju celu partiju', () => {
  it('medium: partija dođe do kraja, bar jedna ruka odigrana', () => {
    const s = playFullGame(2024, 'medium')
    expect(s.phase).toBe('gameOver')
    expect(s.lastHand).not.toBeNull()
    // konzistentnost: štihovi prethodne ruke = 10
    expect(s.lastHand!.tricksWon.reduce((a, b) => a + b, 0)).toBe(10)
  })

  it('radi za sve nivoe bez greške', () => {
    for (const [seed, diff] of [
      [7, 'easy'],
      [42, 'medium'],
      [99, 'hard'],
    ] as const) {
      expect(playFullGame(seed, diff).phase).toBe('gameOver')
    }
  })
})
