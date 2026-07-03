// Tipizirani pozivi edge funkcija + upiti nad tabelama (kroz RLS).
import { supabase } from './supabase'
import type {
  ActRequest,
  CancelGameRequest,
  CreateGameRequest,
  CreateGameResponse,
  GameStatus,
  GetViewRequest,
  JoinGameRequest,
  JoinGameResponse,
  ViewResponse,
} from '@/protocol/messages'

async function invoke<T>(name: string, body: Record<string, unknown> | object): Promise<T> {
  const { data, error } = await supabase().functions.invoke<T>(name, { body })
  if (error) {
    let message = error.message
    // FunctionsHttpError nosi originalni Response u .context — izvuci našu poruku
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload?.error) message = payload.error
      } catch {
        /* nije JSON — ostaje generička poruka */
      }
    }
    throw new Error(message)
  }
  return data as T
}

export interface MyGame {
  id: string
  code: string
  status: GameStatus
  phase: string | null
  handNo: number
  currentActor: number | null
  updatedAt: string
  mySeat: number | null
  players: { seat: number; displayName: string; isBot: boolean }[]
}

export const api = {
  createGame: (req: CreateGameRequest) => invoke<CreateGameResponse>('create-game', req),
  joinGame: (req: JoinGameRequest) => invoke<JoinGameResponse>('join-game', req),
  getView: (req: GetViewRequest) => invoke<ViewResponse>('get-view', req),
  act: (req: ActRequest) => invoke<ViewResponse>('act', req),
  cancelGame: (req: CancelGameRequest) => invoke<{ ok: true }>('cancel-game', req),

  /** Moje nezavršene partije (RLS vraća samo one gde sedim). */
  async myGames(): Promise<MyGame[]> {
    const sb = supabase()
    const { data: session } = await sb.auth.getSession()
    if (!session.session) return []
    const userId = session.session.user.id
    const { data, error } = await sb
      .from('games')
      .select(
        'id, code, status, phase, hand_no, current_actor, updated_at, game_players(seat, user_id, display_name, is_bot)',
      )
      .in('status', ['lobby', 'active'])
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return (data ?? []).map((g) => ({
      id: g.id,
      code: g.code,
      status: g.status,
      phase: g.phase,
      handNo: g.hand_no,
      currentActor: g.current_actor,
      updatedAt: g.updated_at,
      mySeat: g.game_players.find((p) => p.user_id === userId)?.seat ?? null,
      players: g.game_players
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({ seat: p.seat, displayName: p.display_name, isBot: p.is_bot })),
    }))
  },
}
