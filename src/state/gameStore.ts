import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createGame, createGameWithHands, reduce, DEFAULT_CONFIG } from '@engine'
import type { Action, Card, Difficulty, GameState, Rank, Seat, Suit, Trip } from '@engine'

interface GameStore {
  game: GameState | null
  humanSeat: Seat
  difficulty: Difficulty
  newGame: (opts?: { difficulty?: Difficulty; startingBule?: number; seed?: number }) => void
  /** TEST: deli namešten deal sa sigurnim betlom (za isprobavanje auto-završetka) */
  newBetlTest: () => void
  /** TEST: deal gde betl PADA na 1. potezu (za isprobavanje „betl pao") */
  newBetlFailTest: () => void
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
      newBetlTest: () => {
        const H = (suit: Suit, rank: Rank): Card => ({ suit, rank })
        // Ti (sedište 0): u SVAKOJ boji ti je najjača karta niža od protivničke najslabije → siguran betl.
        const hands: Trip<Card[]> = [
          [
            H('pik', '7'), H('pik', '8'), H('pik', '9'),
            H('karo', '7'), H('karo', '8'), H('karo', '9'),
            H('herc', '7'), H('herc', '8'),
            H('tref', '7'), H('tref', '8'),
          ],
          [
            H('pik', '10'), H('pik', 'J'), H('pik', 'Q'), H('pik', 'K'), H('pik', 'A'),
            H('karo', '10'), H('karo', 'J'), H('karo', 'Q'), H('karo', 'K'), H('karo', 'A'),
          ],
          [
            H('herc', '10'), H('herc', 'J'), H('herc', 'Q'), H('herc', 'K'), H('herc', 'A'),
            H('tref', '10'), H('tref', 'J'), H('tref', 'Q'), H('tref', 'K'), H('tref', 'A'),
          ],
        ]
        const talon: Card[] = [H('herc', '9'), H('tref', '9')]
        // dealer = 2 → forehand = sedište 0 (ti licitiraš prvi: „Igra" pa „Betl")
        const game = createGameWithHands({ ...DEFAULT_CONFIG, startingBule: 40 }, 2, hands, talon)
        set({ game, humanSeat: 0 })
      },
      newBetlFailTest: () => {
        const H = (suit: Suit, rank: Rank): Card => ({ suit, rank })
        // Ti (sedište 0): sve najjače karte → koju god povučeš nosiš štih → betl PADA na 1. potezu.
        const hands: Trip<Card[]> = [
          [
            H('pik', '10'), H('pik', 'J'), H('pik', 'Q'), H('pik', 'K'), H('pik', 'A'),
            H('herc', '10'), H('herc', 'J'), H('herc', 'Q'), H('herc', 'K'), H('herc', 'A'),
          ],
          [
            H('pik', '7'), H('pik', '8'), H('pik', '9'),
            H('karo', '7'), H('karo', '8'), H('karo', '9'), H('karo', '10'), H('karo', 'J'), H('karo', 'Q'), H('karo', 'K'),
          ],
          [
            H('herc', '7'), H('herc', '8'), H('herc', '9'),
            H('tref', '7'), H('tref', '8'), H('tref', '9'), H('tref', '10'), H('tref', 'J'), H('tref', 'Q'), H('tref', 'K'),
          ],
        ]
        const talon: Card[] = [H('karo', 'A'), H('tref', 'A')]
        const game = createGameWithHands({ ...DEFAULT_CONFIG, startingBule: 40 }, 2, hands, talon)
        set({ game, humanSeat: 0 })
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
