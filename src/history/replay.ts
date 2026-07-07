// Rekonstrukcija partije iz loga poteza (INIT + engine akcije) — determinističan replay
// kroz engine. Koristi ga i istorija (klijent) i admin panel. Isto što DO radi uživo,
// samo unazad: iz zapisanog loga dobijamo identične ruke i završno stanje.
import { createGame, reduce } from '@engine'
import type { GameState } from '@engine'
import type { LoggedAction } from '@/protocol/messages'
import { appendCompletedHandOnce } from './gameHistory'
import type { GameHistoryHand } from './types'

export function reconstructGame(actions: LoggedAction[]): { hands: GameHistoryHand[]; final: GameState | null } {
  let state: GameState | null = null
  let hands: GameHistoryHand[] = []
  for (const action of actions) {
    if (action.type === 'INIT') {
      state = createGame(action.config, action.seed, 0)
      continue
    }
    if (!state) continue
    try {
      state = reduce(state, action)
    } catch {
      break // log bi trebalo da je validan; u slučaju nesklada staje umesto da pukne
    }
    hands = appendCompletedHandOnce(hands, state)
  }
  return { hands, final: state }
}

/** Samo obodovane ruke (npr. za admin panel „Karte i štihovi"). */
export function buildReplayHands(actions: LoggedAction[]): GameHistoryHand[] {
  return reconstructGame(actions).hands
}
