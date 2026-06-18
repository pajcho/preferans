import { describe, expect, it } from 'vitest'
import { activeSeatCount, createGame, currentActor, DEFAULT_CONFIG, reduce, type Difficulty, type GameState } from '@engine'
import { chooseAction } from '@engine'
import { appendCompletedHandOnce, completedHandFromGame, createGameHistoryRecord, insertHistoryRecord } from './gameHistory'

function playUntilFirstScoredHand(seed: number, difficulty: Difficulty): GameState {
  let state = createGame({ ...DEFAULT_CONFIG, startingBule: 40, mandatoryKontraOnPik: false }, seed, 0)
  let guard = 0
  while (state.phase !== 'handScored' && state.phase !== 'gameOver' && guard++ < 2000) {
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

    expect(hand).not.toBeNull()
    expect(hand?.handNo).toBe(state.lastHand?.handNo)
    expect(hand?.declarer).toBe(state.lastHand?.declarer)
    expect(hand?.bidLog.length).toBeGreaterThan(0)

    const once = appendCompletedHandOnce([], state)
    const twice = appendCompletedHandOnce(once, state)
    expect(once).toHaveLength(1)
    expect(twice).toHaveLength(1)
  })

  it('pravi record završene partije sa rang-listom i ograničenom insert listom', () => {
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
    expect(record.durationMs).toBe(60_000)
    expect(record.handCount).toBe(1)
    expect(record.standings).toHaveLength(3)
    expect(record.standings[0].score).toBeLessThanOrEqual(record.standings[1].score)
    expect(record.finalScores[record.standings[0].seat]).toBe(record.standings[0].score)

    const records = insertHistoryRecord(Array.from({ length: 52 }, (_, index) => ({ ...record, id: `old-${index}` })), record)
    expect(records).toHaveLength(50)
    expect(records[0].id).toBe('history-1')
  })
})

