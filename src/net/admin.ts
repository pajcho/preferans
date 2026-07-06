// Admin API klijent (interni dashboard /admin). Token se čuva u localStorage
// i šalje kao Bearer — server (workers/src/admin.ts) ga poredi sa ADMIN_TOKEN secretom.
import type {
  AdminGameDetail,
  AdminGamesResponse,
  AdminPlayersResponse,
  AdminStats,
} from '@/protocol/admin'
import type { ApiError, GameStatus } from '@/protocol/messages'
import { apiBaseUrl } from './config'

const TOKEN_KEY = 'prefa-admin-token'

export function adminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** 401 — token fali ili je pogrešan; UI vraća na formu za prijavu. */
export class AdminAuthError extends Error {}

async function request<T>(path: string): Promise<T> {
  const base = apiBaseUrl()
  if (!base) throw new Error('Admin nije podešen (nedostaje VITE_API_URL)')
  const token = adminToken()
  if (!token) throw new AdminAuthError('Potreban admin token')

  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new AdminAuthError('Pogrešan admin token')
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

export const adminApi = {
  /** Provera tokena pri prijavi. */
  ping: () => request<{ ok: true }>('/api/admin/ping'),
  stats: () => request<AdminStats>('/api/admin/stats'),
  games: (opts: { status?: GameStatus | ''; q?: string; limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.status) params.set('status', opts.status)
    if (opts.q) params.set('q', opts.q)
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts.offset) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return request<AdminGamesResponse>(`/api/admin/games${qs ? `?${qs}` : ''}`)
  },
  gameDetail: (code: string) => request<AdminGameDetail>(`/api/admin/games/${code}`),
  players: (opts: { limit?: number; offset?: number } = {}) => {
    const params = new URLSearchParams()
    if (opts.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts.offset) params.set('offset', String(opts.offset))
    const qs = params.toString()
    return request<AdminPlayersResponse>(`/api/admin/players${qs ? `?${qs}` : ''}`)
  },
}
