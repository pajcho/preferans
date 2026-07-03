// ─────────────────────────────────────────────────────────────
// Online partija (Faza 2): server je autoritet, klijent drži
// redigovan GameState + metapodatke i reaguje na realtime evente.
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Action, GameState, Seat } from '@engine'
import type { GameMeta, SeatsConfig, ViewResponse } from '@/protocol/messages'
import { api } from '@net/api'
import { ensureSession, supabase } from '@net/supabase'
import { appendCompletedHandOnce } from '@/history/gameHistory'
import type { GameHistoryHand } from '@/history/types'

let channel: RealtimeChannel | null = null
let pollTimer: number | null = null
let refreshInFlight: Promise<void> | null = null

interface OnlineStore {
  /** ime igrača (localStorage; upisuje se u profil pri create/join) */
  displayName: string
  setDisplayName: (name: string) => void

  gameId: string | null
  code: string | null
  role: 'player' | 'spectator' | null
  mySeat: Seat | null
  meta: GameMeta | null
  /** redigovan GameState sa servera (null u lobiju) */
  state: GameState | null
  /** završene ruke viđene u ovoj sesiji (panel „Potezi") */
  hands: GameHistoryHand[]
  connected: boolean
  /** mesta čiji su igrači trenutno online (preko presence) */
  presentSeats: Seat[]
  pendingAction: boolean
  error: string | null
  clearError: () => void

  createGame: (seats: SeatsConfig, startingBule?: number) => Promise<{ gameId: string; code: string }>
  joinByCode: (code: string) => Promise<{ gameId: string; role: 'player' | 'spectator' }>
  /** učitaj pogled i pretplati se na promene (ulazak na /o/:code) */
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
    if (prev.meta && prev.gameId === view.game.id && view.game.version < prev.meta.version) return {}
    return {
      gameId: view.game.id,
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

async function trackPresence(): Promise<void> {
  if (!channel) return
  const store = useOnlineStore.getState()
  try {
    await channel.track({ seat: store.mySeat, name: store.displayName || 'Igrač' })
  } catch {
    /* presence je best-effort */
  }
}

function teardown(): void {
  if (channel) {
    void channel.unsubscribe()
    channel = null
  }
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

export const useOnlineStore = create<OnlineStore>()(
  persist(
    (set, get) => ({
      displayName: '',
      setDisplayName: (name) => set({ displayName: name.slice(0, 20) }),

      gameId: null,
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
        await ensureSession(name)
        const res = await api.createGame({ displayName: name, seats, startingBule })
        return { gameId: res.gameId, code: res.code }
      },

      joinByCode: async (rawCode) => {
        const code = rawCode.trim().toUpperCase()
        const name = get().displayName.trim()
        await ensureSession(name)
        const res = await api.joinGame({ code, displayName: name || 'Igrač' })
        return { gameId: res.gameId, role: res.role }
      },

      enter: async (rawCode) => {
        const code = rawCode.trim().toUpperCase()
        await ensureSession(get().displayName.trim())

        // nova partija? — očisti prethodnu sesiju stola
        if (get().code !== code) {
          teardown()
          set({ gameId: null, meta: null, state: null, hands: [], role: null, mySeat: null, presentSeats: [] })
        }

        const view = await api.getView({ code })
        applyView(set, view)

        const gameId = view.game.id
        if (!channel) {
          channel = supabase()
            .channel(`game:${gameId}`)
            .on('broadcast', { event: 'update' }, () => {
              void get().refresh()
            })
            .on('presence', { event: 'sync' }, () => {
              if (!channel) return
              const seats = Object.values(channel.presenceState())
                .flat()
                .map((m) => (m as { seat?: Seat | null }).seat)
                .filter((s): s is Seat => s === 0 || s === 1 || s === 2)
              set({ presentSeats: [...new Set(seats)] })
            })
          channel.subscribe((status) => {
            set({ connected: status === 'SUBSCRIBED' })
            if (status === 'SUBSCRIBED') {
              void trackPresence()
              void get().refresh() // resync posle (re)konekcije
            }
          })
        }

        // fallback: povremeni refresh dok je partija živa (bot potezi bez browsera i sl.)
        if (pollTimer === null) {
          pollTimer = window.setInterval(() => {
            const meta = get().meta
            if (meta && (meta.status === 'active' || meta.status === 'lobby')) void get().refresh()
          }, 12000)
        }
      },

      refresh: async () => {
        const gameId = get().gameId
        if (!gameId) return
        if (refreshInFlight) return refreshInFlight
        refreshInFlight = (async () => {
          try {
            const view = await api.getView({ gameId })
            applyView(set, view)
          } catch (e) {
            console.error('[online] refresh:', e)
          } finally {
            refreshInFlight = null
          }
        })()
        return refreshInFlight
      },

      act: async (action) => {
        const gameId = get().gameId
        if (!gameId || get().pendingAction) return
        set({ pendingAction: true })
        try {
          const view = await api.act({ gameId, action })
          applyView(set, view)
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Potez nije prošao' })
          await get().refresh() // resinhronizuj — možda smo bili zastareli
        } finally {
          set({ pendingAction: false })
        }
      },

      cancelGame: async () => {
        const gameId = get().gameId
        if (!gameId) return
        await api.cancelGame({ gameId })
        await get().refresh()
      },

      leave: () => {
        teardown()
        set({
          gameId: null,
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
