import { describe, expect, it } from 'vitest'
import {
  activeSeatCount,
  createGame,
  currentActor,
  DEFAULT_CONFIG,
  reduce,
  type Difficulty,
  type GameState,
} from '@engine'
import { chooseAction } from '@engine'
import { appendCompletedHandOnce, completedHandFromGame, createGameHistoryRecord } from './gameHistory'

function playUntilFirstScoredHand(seed: number, difficulty: Difficulty): GameState {
  let state = createGame({ ...DEFAULT_CONFIG, startingBule: 40, mandatoryKontraOnPik: false }, seed, 0)
  let guard = 0
  while (guard++ < 2000) {
    if (state.phase === 'gameOver') break
    if (state.phase === 'handScored') {
      if (state.lastHand?.kind === 'played') break
      state = reduce(state, { type: 'NEXT_HAND' }) // preskoči praznu (refe) ruku do prve odigrane
      continue
    }
    if (state.phase === 'playing' && state.trick && state.trick.cards.length === activeSeatCount(state)) {
      state = reduce(state, { type: 'RESOLVE_TRICK' })
      continue
    }
    if (state.phase === 'claim') {
      state = reduce(state, { type: 'FINALIZE_CLAIM' })
      continue
    }
    const actor = currentActor(state)
    if (actor === null) throw new Error(`nema aktera u fazi ${state.phase}`)
    state = reduce(state, chooseAction(state, actor, difficulty))
  }
  return state
}

describe('game history', () => {
  it('izdvaja završenu ruku i ne duplira isti handNo', () => {
    const state = playUntilFirstScoredHand(2026, 'medium')
    const hand = completedHandFromGame(state)

    expect(hand?.kind).toBe('played')
    expect(hand?.handNo).toBe(state.lastHand?.handNo)
    if (hand?.kind === 'played' && state.lastHand?.kind === 'played') {
      expect(hand.declarer).toBe(state.lastHand.declarer)
      expect(hand.bidLog.length).toBeGreaterThan(0)
      expect(hand.initialHands.map((cards) => cards.length)).toEqual([10, 10, 10])
      expect(hand.discard).toEqual(state.lastHand.discard)
    }

    const once = appendCompletedHandOnce([], state)
    const twice = appendCompletedHandOnce(once, state)
    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
  })

  it('pravi record završene partije sa rang-listom', () => {
    const state = playUntilFirstScoredHand(42, 'hard')
    const hands = appendCompletedHandOnce([], state)
    const record = createGameHistoryRecord({
      id: 'history-1',
      game: state,
      hands,
      difficulty: 'hard',
      humanSeat: 0,
      playerNames: ['Ti', 'Laza', 'Mika'],
      startedAt: 1000,
      completedAt: 61_000,
    })

    expect(record.schemaVersion).toBe(1)
    expect(record.mode).toBe('vs-cpu')
    expect(record.durationMs).toBe(60_000)
    expect(record.handCount).toBe(1)
    expect(record.standings).toHaveLength(3)
    expect(record.standings[0].score).toBeLessThanOrEqual(record.standings[1].score)
    expect(record.finalScores[record.standings[0].seat]).toBe(record.standings[0].score)
  })
})
