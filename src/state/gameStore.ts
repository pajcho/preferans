import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createGame, reduce, DEFAULT_CONFIG } from '@engine'
import type { Action, Difficulty, GameState, Seat } from '@engine'

interface GameStore {
  game: GameState | null
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
      humanSeat: 0,
      difficulty: 'medium',
      newGame: (opts) => {
        const difficulty = opts?.difficulty ?? get().difficulty
        const startingBule = opts?.startingBule ?? 40
        const seed = opts?.seed ?? freshSeed()
        const game = createGame({ ...DEFAULT_CONFIG, startingBule }, seed, 0)
        set({ game, difficulty, humanSeat: 0 })
      },
      dispatch: (a) => {
        const { game } = get()
        if (!game) return
        try {
          set({ game: reduce(game, a) })
        } catch (e) {
          console.error('[preferans] nedozvoljena akcija', a, e)
        }
      },
      quit: () => set({ game: null }),
    }),
    {
      name: 'preferans-vs-cpu-v6',
      partialize: (s) => ({ game: s.game, humanSeat: s.humanSeat, difficulty: s.difficulty }),
    },
  ),
)
