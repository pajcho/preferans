// Tipizirani REST pozivi ka Cloudflare Worker-u (create/join/mine/view/cancel).
// Za tok partije se ne koristi REST nego WebSocket (vidi socket.ts).
import type {
  ApiError,
  ConfigureGameRequest,
  CreateGameRequest,
  CreateGameResponse,
  JoinGameRequest,
  JoinGameResponse,
  MyGame,
  ViewResponse,
} from '@/protocol/messages'
import { ensureAuth } from './auth'
import { apiBaseUrl } from './config'

async function request<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const base = apiBaseUrl()
  if (!base) throw new Error('Online igra nije podešena (nedostaje VITE_API_URL)')
  const { token } = await ensureAuth()

  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    let message = `Greška servera (${res.status})`
    try {
      const payload = (await res.json()) as ApiError
      if (payload.error) message = payload.error
    } catch {
      /* nije JSON — ostaje generička poruka */
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const api = {
  createGame: (req: CreateGameRequest) => request<CreateGameResponse>('/api/games', { body: req }),
  joinGame: (req: JoinGameRequest) => request<JoinGameResponse>('/api/games/join', { body: req }),
  /** Jednokratni pogled (ulazak na sto pre nego što se WS otvori). */
  getView: (code: string) => request<ViewResponse>(`/api/games/${code}/view`),
  /** Podešavanje lobija (samo kreator): mesta igrač/bot, bule, refe. */
  configureGame: (code: string, patch: ConfigureGameRequest) =>
    request<null>(`/api/games/${code}/config`, { body: patch }),
  /** Start partije (samo kreator, sva mesta popunjena). */
  startGame: (code: string) => request<null>(`/api/games/${code}/start`, { method: 'POST' }),
  cancelGame: (code: string) => request<{ ok: true }>(`/api/games/${code}/cancel`, { method: 'POST' }),
  /** Moje nezavršene partije (server filtrira po identitetu). */
  myGames: () => request<MyGame[]>('/api/games/mine'),
}
