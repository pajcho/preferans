// Istorija završenih partija — server-backed (D1 lista + rekonstrukcija replay-a iz DO loga).
// Zamena za nekadašnju lokalnu (localStorage) istoriju: sada prati nalog/identitet na svim
// uređajima i pokriva i vs-kompjuter (koji su sada obične online partije sa botovima) i online.
import { create } from 'zustand'
import type { Difficulty, Seat, Trip } from '@engine'
import type { HistoryGameItem } from '@/protocol/messages'
import { api } from '@net/api'
import { createGameHistoryRecord } from '@/history/gameHistory'
import { reconstructGame } from '@/history/replay'
import type { GameHistoryRecord } from '@/history/types'

interface HistoryStore {
  /** null = još nije učitano; [] = učitano, prazno */
  list: HistoryGameItem[] | null
  loading: boolean
  error: string | null
  loadList: () => Promise<void>
  /** keš rekonstruisanih partija po kodu */
  replays: Record<string, GameHistoryRecord>
  loadReplay: (code: string) => Promise<GameHistoryRecord | null>
}

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  list: null,
  loading: false,
  error: null,
  replays: {},

  loadList: async () => {
    set({ loading: true, error: null })
    try {
      const list = await api.historyGames()
      set({ list, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Učitavanje istorije nije uspelo', loading: false })
    }
  },

  loadReplay: async (code) => {
    const cached = get().replays[code]
    if (cached) return cached
    try {
      const res = await api.gameReplay(code)
      const { hands, final } = reconstructGame(res.actions)
      if (!final) return null

      const playerNames = ([0, 1, 2] as Seat[]).map(
        (seat) => res.players.find((p) => p.seat === seat)?.displayName ?? `Igrač ${seat + 1}`,
      ) as Trip<string>
      const humanSeat = res.mySeat ?? 0
      const botDifficulty = res.players.find((p) => p.isBot)?.botDifficulty ?? undefined
      // vs-kompjuter = svi protivnici su botovi; inače online (bar jedan čovek)
      const online = res.players.some((p) => p.seat !== humanSeat && !p.isBot)

      const record = createGameHistoryRecord({
        id: code,
        game: final,
        hands,
        difficulty: (botDifficulty ?? 'medium') as Difficulty,
        humanSeat,
        playerNames,
        startedAt: res.startedAt ? Date.parse(res.startedAt) : 0,
        completedAt: res.finishedAt ? Date.parse(res.finishedAt) : 0,
        mode: online ? 'online' : 'vs-cpu',
      })
      set((s) => ({ replays: { ...s.replays, [code]: record } }))
      return record
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Učitavanje partije nije uspelo' })
      return null
    }
  },
}))
