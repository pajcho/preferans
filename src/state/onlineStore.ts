// ─────────────────────────────────────────────────────────────
// Online partija (Faza 2): server (GameRoom DO) je autoritet, klijent drži
// redigovan GameState + metapodatke koje server gura kroz WebSocket.
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Action, GameState, Seat } from '@engine'
import type { GameMeta, SeatsConfig, ServerMessage, ViewResponse } from '@/protocol/messages'
import { api } from '@net/api'
import { ensureAuth } from '@net/auth'
import { GameSocket } from '@net/socket'
import { appendCompletedHandOnce } from '@/history/gameHistory'
import type { GameHistoryHand } from '@/history/types'

let socket: GameSocket | null = null

interface OnlineStore {
  /** ime igrača (localStorage; šalje se pri create/join) */
  displayName: string
  setDisplayName: (name: string) => void

  code: string | null
  role: 'player' | 'spectator' | null
  mySeat: Seat | null
  meta: GameMeta | null
  /** redigovan GameState sa servera (null u lobiju) */
  state: GameState | null
  /** završene ruke viđene u ovoj sesiji (panel „Potezi") */
  hands: GameHistoryHand[]
  connected: boolean
  /** mesta čiji su igrači trenutno online (server šalje kroz WS) */
  presentSeats: Seat[]
  pendingAction: boolean
  error: string | null
  clearError: () => void

  createGame: (seats: SeatsConfig, startingBule?: number) => Promise<{ code: string }>
  joinByCode: (code: string) => Promise<{ role: 'player' | 'spectator' }>
  /** učitaj pogled i otvori WS (ulazak na /o/:code) */
  enter: (code: string) => Promise<void>
  refresh: () => Promise<void>
  act: (action: Action) => Promise<void>
  cancelGame: () => Promise<void>
  leave: () => void
}

function applyView(
  set: (partial: Partial<OnlineStore> | ((s: OnlineStore) => Partial<OnlineStore>)) => void,
  view: ViewResponse,
): void {
  set((prev) => {
    // odbaci zakasnele odgovore (stariju verziju od već prikazane)
    if (prev.meta && prev.code === view.game.code && view.game.version < prev.meta.version) return {}
    return {
      code: view.game.code,
      meta: view.game,
      role: view.role,
      mySeat: view.mySeat,
      state: view.state,
      hands: view.state ? appendCompletedHandOnce(prev.hands, view.state) : prev.hands,
      error: null,
    }
  })
}

function teardown(): void {
  if (socket) {
    socket.close()
    socket = null
  }
}

export const useOnlineStore = create<OnlineStore>()(
  persist(
    (set, get) => ({
      displayName: '',
      setDisplayName: (name) => set({ displayName: name.slice(0, 20) }),

      code: null,
      role: null,
      mySeat: null,
      meta: null,
      state: null,
      hands: [],
      connected: false,
      presentSeats: [],
      pendingAction: false,
      error: null,
      clearError: () => set({ error: null }),

      createGame: async (seats, startingBule = 40) => {
        const name = get().displayName.trim()
        await ensureAuth()
        const res = await api.createGame({ displayName: name, seats, startingBule })
        return { code: res.code }
      },

      joinByCode: async (rawCode) => {
        const code = rawCode.trim().toUpperCase()
        const name = get().displayName.trim()
        await ensureAuth()
        const res = await api.joinGame({ code, displayName: name || 'Igrač' })
        return { role: res.role }
      },

      enter: async (rawCode) => {
        const code = rawCode.trim().toUpperCase()
        const { token } = await ensureAuth()

        // nova partija? — očisti prethodnu sesiju stola
        if (get().code !== code) {
          teardown()
          set({ code: null, meta: null, state: null, hands: [], role: null, mySeat: null, presentSeats: [] })
        }

        // jednokratni REST view: brz prvi render + jasna greška (npr. nepostojeći kod)
        const view = await api.getView(code)
        applyView(set, view)

        if (!socket) {
          socket = new GameSocket(code, token, {
            onMessage: (msg: ServerMessage) => {
              if (msg.type === 'view') applyView(set, msg.view)
              else if (msg.type === 'presence') set({ presentSeats: msg.seats })
              else if (msg.type === 'error' && !msg.reqId) set({ error: msg.message })
            },
            onStatus: (connected) => set({ connected }),
          })
        }
      },

      refresh: async () => {
        if (socket?.isOpen) {
          socket.sync()
          return
        }
        const code = get().code
        if (!code) return
        try {
          applyView(set, await api.getView(code))
        } catch (e) {
          console.error('[online] refresh:', e)
        }
      },

      act: async (action) => {
        if (!socket || get().pendingAction) return
        set({ pendingAction: true })
        try {
          await socket.act(action) // ack — novi view stiže kroz WS push
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Potez nije prošao' })
          socket.sync() // resinhronizuj — možda smo bili zastareli
        } finally {
          set({ pendingAction: false })
        }
      },

      cancelGame: async () => {
        const code = get().code
        if (!code) return
        await api.cancelGame(code)
        await get().refresh()
      },

      leave: () => {
        teardown()
        set({
          code: null,
          role: null,
          mySeat: null,
          meta: null,
          state: null,
          hands: [],
          connected: false,
          presentSeats: [],
          pendingAction: false,
          error: null,
        })
      },
    }),
    {
      name: 'prefa-online-v1',
      partialize: (s) => ({ displayName: s.displayName }),
    },
  ),
)
