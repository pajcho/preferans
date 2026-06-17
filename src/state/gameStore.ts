import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createGame, createGameWithHands, reduce, DEFAULT_CONFIG } from '@engine'
import type { Action, Card, Difficulty, GameState, Rank, Seat, Suit, Trip } from '@engine'

interface GameStore {
  game: GameState | null
  gameStartedAt: number | null
  humanSeat: Seat
  difficulty: Difficulty
  newGame: (opts?: { difficulty?: Difficulty; startingBule?: number; seed?: number }) => void
  /** DEMO: namešten deal gde AI (Mika) odmah zove „Igra" pa si ti na potezu da reaguješ */
  newIgraDemo: () => void
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
      humanSeat: 0,
      difficulty: 'medium',
      newGame: (opts) => {
        const difficulty = opts?.difficulty ?? get().difficulty
        const startingBule = opts?.startingBule ?? 40
        const seed = opts?.seed ?? freshSeed()
        const game = createGame({ ...DEFAULT_CONFIG, startingBule }, seed, 0)
        set({ game, gameStartedAt: Date.now(), difficulty, humanSeat: 0 })
      },
      newIgraDemo: () => {
        const H = (suit: Suit, rank: Rank): Card => ({ suit, rank })
        // dealer=1 → redosled [2,0,1]: Mika(2) licitira prvi → „Igra" (igra-pik),
        // pa si odmah ti (0) na potezu da reaguješ (Dalje / Igra / Betl / Sans).
        const hands: Trip<Card[]> = [
          // Ti (0) — jaka reaktivna ruka (možeš igra-karo / betl / sans)
          [
            H('karo', 'A'), H('karo', 'J'), H('karo', '10'), H('karo', '9'),
            H('herc', 'A'), H('herc', '10'), H('herc', '9'),
            H('tref', 'A'), H('tref', 'Q'), H('tref', 'J'),
          ],
          // Laza (1) — filer (na potezu tek posle tebe)
          [
            H('pik', '9'), H('pik', '8'), H('pik', '7'),
            H('karo', '8'), H('karo', '7'),
            H('herc', 'J'), H('herc', '8'), H('herc', '7'),
            H('tref', '10'), H('tref', '9'),
          ],
          // Mika (2) — zove „Igra": pet pikova + figure, ali ne dovoljno za sans
          [
            H('pik', 'A'), H('pik', 'K'), H('pik', 'Q'), H('pik', 'J'), H('pik', '10'),
            H('herc', 'K'), H('herc', 'Q'),
            H('karo', 'K'), H('karo', 'Q'),
            H('tref', 'K'),
          ],
        ]
        const talon: Card[] = [H('tref', '8'), H('tref', '7')]
        const game = createGameWithHands({ ...DEFAULT_CONFIG, startingBule: 40 }, 1, hands, talon)
        set({ game, gameStartedAt: Date.now(), difficulty: 'medium', humanSeat: 0 })
      },
      dispatch: (a) => {
        const { game } = get()
        if (!game) return
        try {
          set({ game: reduce(game, a) })
        } catch (e) {
          console.error('[prefa] nedozvoljena akcija', a, e)
        }
      },
      quit: () => set({ game: null, gameStartedAt: null }),
    }),
    {
      name: 'prefa-vs-cpu-v1',
      partialize: (s) => ({
        game: s.game,
        gameStartedAt: s.gameStartedAt,
        humanSeat: s.humanSeat,
        difficulty: s.difficulty,
      }),
    },
  ),
)
