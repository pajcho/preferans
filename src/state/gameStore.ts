import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createGame, reduce, DEFAULT_CONFIG } from '@engine'
import type { Action, Difficulty, GameState, Seat, Trip } from '@engine'
import { appendCompletedHandOnce, createGameHistoryRecord, makeLocalHistoryId } from '@/history/gameHistory'
import type { GameHistoryHand } from '@/history/types'
import { useHistoryStore } from './historyStore'

const PLAYER_NAMES: Trip<string> = ['Ti', 'Laza', 'Mika']

interface GameStore {
  game: GameState | null
  gameStartedAt: number | null
  currentGameHands: GameHistoryHand[]
  savedHistoryId: string | null
  humanSeat: Seat
  difficulty: Difficulty
  newGame: (opts?: { difficulty?: Difficulty; startingBule?: number; seed?: number }) => void
  dispatch: (a: Action) => void
  quit: () => void
}

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      game: null,
      gameStartedAt: null,
      currentGameHands: [],
      savedHistoryId: null,
      humanSeat: 0,
      difficulty: 'medium',
      newGame: (opts) => {
        const difficulty = opts?.difficulty ?? get().difficulty
        const startingBule = opts?.startingBule ?? 40
        const seed = opts?.seed ?? freshSeed()
        const game = createGame({ ...DEFAULT_CONFIG, startingBule }, seed, 0)
        set({ game, gameStartedAt: Date.now(), currentGameHands: [], savedHistoryId: null, difficulty, humanSeat: 0 })
      },
      dispatch: (a) => {
        const { game } = get()
        if (!game) return
        try {
          const next = reduce(game, a)
          const current = get()
          const currentGameHands = appendCompletedHandOnce(current.currentGameHands, next)
          let savedHistoryId = current.savedHistoryId

          if (next.phase === 'gameOver' && game.phase !== 'gameOver' && !savedHistoryId && current.gameStartedAt) {
            const completedAt = Date.now()
            savedHistoryId = makeLocalHistoryId(completedAt, next.seed)
            useHistoryStore.getState().saveRecord(
              createGameHistoryRecord({
                id: savedHistoryId,
                game: next,
                hands: currentGameHands,
                difficulty: current.difficulty,
                humanSeat: current.humanSeat,
                playerNames: [...PLAYER_NAMES] as Trip<string>,
                startedAt: current.gameStartedAt,
                completedAt,
              }),
            )
          }

          set({ game: next, currentGameHands, savedHistoryId })
        } catch (e) {
          console.error('[prefa] nedozvoljena akcija', a, e)
        }
      },
      quit: () => set({ game: null, gameStartedAt: null, currentGameHands: [], savedHistoryId: null }),
    }),
    {
      name: 'prefa-vs-cpu-v1',
      partialize: (s) => ({
        game: s.game,
        gameStartedAt: s.gameStartedAt,
        currentGameHands: s.currentGameHands,
        savedHistoryId: s.savedHistoryId,
        humanSeat: s.humanSeat,
        difficulty: s.difficulty,
      }),
    },
  ),
)
