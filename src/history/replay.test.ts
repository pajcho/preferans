// Rekonstrukcija iz loga poteza mora da da ISTE ruke i ISTO završno stanje kao igra uživo.
// Vozimo celu partiju kroz reducer (isti tok kao GameRoom DO: bot potez / RESOLVE_TRICK /
// FINALIZE_CLAIM / NEXT_HAND), beležimo log, pa ga replay-ujemo i poredimo.
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, activeSeatCount, chooseAction, createGame, currentActor, reduce } from '@engine'
import type { Action, GameState } from '@engine'
import type { LoggedAction } from '@/protocol/messages'
import { appendCompletedHandOnce } from './gameHistory'
import type { GameHistoryHand } from './types'
import { buildReplayHands, reconstructGame } from './replay'

function playThrough(seed: number): { log: LoggedAction[]; liveHands: GameHistoryHand[]; finalState: GameState } {
  const config = DEFAULT_CONFIG
  let state: GameState = createGame(config, seed, 0)
  const log: LoggedAction[] = [{ type: 'INIT', seed, config }]
  let liveHands: GameHistoryHand[] = []

  for (let guard = 0; state.phase !== 'gameOver' && guard < 20_000; guard += 1) {
    let action: Action
    if (state.phase === 'playing' && state.trick && state.trick.cards.length === activeSeatCount(state)) {
      action = { type: 'RESOLVE_TRICK' }
    } else if (state.phase === 'claim') {
      action = { type: 'FINALIZE_CLAIM' }
    } else if (state.phase === 'handScored') {
      action = { type: 'NEXT_HAND' }
    } else {
      const actor = currentActor(state)
      if (actor === null) break
      action = chooseAction(state, actor, 'easy')
    }
    state = reduce(state, action)
    log.push(action)
    liveHands = appendCompletedHandOnce(liveHands, state)
  }

  return { log, liveHands, finalState: state }
}

describe('reconstructGame (replay iz loga poteza)', () => {
  it.each([7, 12345])('rekonstrukcija = igra uživo (ruke + završno stanje) (seed %i)', (seed) => {
    const { log, liveHands, finalState } = playThrough(seed)

    expect(liveHands.length).toBeGreaterThanOrEqual(1)
    for (const hand of liveHands) {
      expect(hand.initialHands.flat()).toHaveLength(30) // 3×10 podeljenih karata
    }

    const { hands, final } = reconstructGame(log)
    expect(hands).toEqual(liveHands)
    expect(final).toEqual(finalState)
  })

  it('bez INIT-a (nepotpun/seed log) vraća prazno, ne baca', () => {
    expect(buildReplayHands([])).toEqual([])
    expect(buildReplayHands([{ type: 'NEXT_HAND' }])).toEqual([])
  })
})
