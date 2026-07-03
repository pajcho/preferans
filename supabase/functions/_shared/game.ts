// ─────────────────────────────────────────────────────────────
// Server autoritet: učitavanje/čuvanje partije, primena poteza (CAS),
// bot automatika sa serverskim tempom i realtime notifikacije.
// ─────────────────────────────────────────────────────────────
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DEFAULT_CONFIG,
  activeSeatCount,
  chooseAction,
  createGame,
  currentActor,
  finalScore,
  reduce,
  redactStateFor,
} from './engine/index.ts'
import type { Action, Difficulty, GameState, Seat, Trip } from './engine/index.ts'
import type {
  BroadcastUpdate,
  GameStatus,
  SeatsConfig,
  ViewResponse,
} from './protocol/messages.ts'
import { ConflictError, HttpError } from './http.ts'
import { serviceKey, supabaseUrl } from './db.ts'

export interface GameRow {
  id: string
  code: string
  status: GameStatus
  created_by: string
  config: { startingBule: number; seats: SeatsConfig }
  phase: string | null
  hand_no: number
  current_actor: number | null
  version: number
  summary: unknown
  updated_at: string
  started_at: string | null
}

export interface PlayerRow {
  game_id: string
  seat: number
  user_id: string | null
  display_name: string
  is_bot: boolean
  bot_difficulty: Difficulty | null
}

export interface Ctx {
  admin: SupabaseClient
  row: GameRow
  players: PlayerRow[]
  state: GameState | null
  version: number
}

// bez dvosmislenih znakova (0/O, 1/I/L) — 30^6 ≈ 729M kombinacija
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ2345678'

export function generateCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function randomSeed(): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]
}

export function randomInt(maxExclusive: number): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] % maxExclusive
}

export async function loadGame(
  admin: SupabaseClient,
  by: { id?: string; code?: string },
): Promise<Ctx> {
  let query = admin.from('games').select('*')
  if (by.id) query = query.eq('id', by.id)
  else if (by.code) query = query.eq('code', by.code.trim().toUpperCase())
  else throw new HttpError(400, 'Nedostaje id ili kod partije')

  const { data: row, error } = await query.maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!row) throw new HttpError(404, 'Partija nije pronađena')

  const { data: players, error: pErr } = await admin
    .from('game_players')
    .select('*')
    .eq('game_id', row.id)
    .order('seat')
  if (pErr) throw new HttpError(500, pErr.message)

  let state: GameState | null = null
  let version: number = row.version
  if (row.status === 'active' || row.status === 'finished') {
    const { data: st } = await admin
      .from('game_states')
      .select('state, version')
      .eq('game_id', row.id)
      .maybeSingle()
    if (st) {
      state = st.state as GameState
      version = st.version
    }
  }
  return { admin, row: row as GameRow, players: (players ?? []) as PlayerRow[], state, version }
}

/** Realtime broadcast na javni kanal `game:{id}` (klijenti na njega samo reaguju get-view-om). */
export async function notify(gameId: string, payload: BroadcastUpdate): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `game:${gameId}`, event: 'update', payload, private: false }],
      }),
    })
    if (!res.ok) console.error('[notify] broadcast nije prošao:', res.status, await res.text())
  } catch (e) {
    console.error('[notify]', e)
  }
}

function summarize(state: GameState): { scores: Trip<number> } {
  const seats: Seat[] = [0, 1, 2]
  const scores = seats.map((s) => {
    const others = seats.filter((o) => o !== s)
    const supaFor = others.reduce((sum, o) => sum + state.ledger.supe[s][o], 0)
    const supaAgainst = others.reduce((sum, o) => sum + state.ledger.supe[o][s], 0)
    return finalScore(state.ledger.bule[s], supaFor, supaAgainst)
  }) as [number, number, number]
  return { scores }
}

/**
 * Primeni JEDAN potez uz optimističko zaključavanje (version CAS).
 * Baca ConflictError ako je neko pretekao — pozivalac ponovo učitava stanje.
 */
export async function applyAction(ctx: Ctx, action: Action, actorSeat: Seat | null): Promise<void> {
  if (ctx.row.status !== 'active' || !ctx.state) throw new HttpError(409, 'Partija nije aktivna')

  let next: GameState
  try {
    next = reduce(ctx.state, action)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'Nedozvoljen potez')
  }

  const newVersion = ctx.version + 1
  const { data: updated, error } = await ctx.admin
    .from('game_states')
    .update({ state: next, version: newVersion })
    .eq('game_id', ctx.row.id)
    .eq('version', ctx.version)
    .select('version')
  if (error) throw new HttpError(500, error.message)
  if (!updated || updated.length === 0) throw new ConflictError()

  // append-only log poteza (seq = nova verzija); duplikat se tiho ignoriše
  const { error: aErr } = await ctx.admin.from('game_actions').upsert(
    {
      game_id: ctx.row.id,
      seq: newVersion,
      hand_no: ctx.state.handNo,
      seat: actorSeat,
      action,
    },
    { onConflict: 'game_id,seq', ignoreDuplicates: true },
  )
  if (aErr) console.error('[applyAction] log poteza:', aErr.message)

  const finished = next.phase === 'gameOver'
  const { error: gErr } = await ctx.admin
    .from('games')
    .update({
      version: newVersion,
      phase: next.phase,
      hand_no: next.handNo,
      current_actor: currentActor(next),
      ...(finished
        ? { status: 'finished', finished_at: new Date().toISOString(), summary: summarize(next) }
        : {}),
    })
    .eq('id', ctx.row.id)
  if (gErr) console.error('[applyAction] games meta:', gErr.message)

  ctx.state = next
  ctx.version = newVersion
  if (finished) ctx.row.status = 'finished'

  await notify(ctx.row.id, {
    version: newVersion,
    status: ctx.row.status,
    phase: next.phase,
    actor: currentActor(next),
  })
}

/** Podeli karte i aktiviraj partiju (kad su sva 3 mesta popunjena). */
export async function startGame(ctx: Ctx): Promise<void> {
  if (ctx.row.status !== 'lobby') return
  const seed = randomSeed()
  const config = { ...DEFAULT_CONFIG, startingBule: ctx.row.config.startingBule ?? 40 }
  const state = createGame(config, seed, 0)

  const { error: sErr } = await ctx.admin
    .from('game_states')
    .insert({ game_id: ctx.row.id, state, version: 1 })
  if (sErr) {
    // već startovana u paralelnom pozivu — nije greška
    console.error('[startGame] game_states insert:', sErr.message)
    return
  }
  await ctx.admin.from('game_actions').upsert(
    {
      game_id: ctx.row.id,
      seq: 1,
      hand_no: 1,
      seat: null,
      action: { type: 'INIT', seed, config },
    },
    { onConflict: 'game_id,seq', ignoreDuplicates: true },
  )
  await ctx.admin
    .from('games')
    .update({
      status: 'active',
      started_at: new Date().toISOString(),
      version: 1,
      phase: state.phase,
      hand_no: state.handNo,
      current_actor: currentActor(state),
    })
    .eq('id', ctx.row.id)

  ctx.row.status = 'active'
  ctx.state = state
  ctx.version = 1

  await notify(ctx.row.id, {
    version: 1,
    status: 'active',
    phase: state.phase,
    actor: currentActor(state),
  })
}

const MAX_AUTOMATION_STEPS = 60
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Serverska automatika: botovi igraju, štih se zatvara posle pauze,
 * claim se finalizuje — sve sa tempom kao u vs-cpu UI-ju (0.8s / 1.6s / 3.5s).
 * Staje čim je na potezu čovek (ili u handScored — „Sledeća ruka" je na igračima).
 * Bezbedna za paralelne pozive: svaka primena je CAS po verziji.
 */
export async function runAutomation(admin: SupabaseClient, gameId: string): Promise<void> {
  for (let step = 0; step < MAX_AUTOMATION_STEPS; step += 1) {
    let ctx: Ctx
    try {
      ctx = await loadGame(admin, { id: gameId })
    } catch {
      return
    }
    if (ctx.row.status !== 'active' || !ctx.state) return
    const s = ctx.state

    let action: Action | null = null
    let actorSeat: Seat | null = null
    let delay = 0

    if (s.phase === 'playing' && s.trick && s.trick.cards.length === activeSeatCount(s)) {
      action = { type: 'RESOLVE_TRICK' }
      delay = 1600
    } else if (s.phase === 'claim') {
      action = { type: 'FINALIZE_CLAIM' }
      delay = 3500
    } else if (s.phase === 'handScored' || s.phase === 'gameOver') {
      return
    } else {
      const actor = currentActor(s)
      if (actor === null) return
      const bot = ctx.players.find((p) => p.seat === actor && p.is_bot)
      if (!bot) return
      action = chooseAction(s, actor, bot.bot_difficulty ?? 'medium')
      actorSeat = actor
      delay = 800
    }

    if (delay > 0) await sleep(delay)
    try {
      await applyAction(ctx, action, actorSeat)
    } catch (e) {
      if (e instanceof ConflictError) continue // pretečeni smo — učitaj sveže stanje
      console.error('[automation]', e)
      return
    }
  }
  console.error(`[automation] prekid posle ${MAX_AUTOMATION_STEPS} koraka (game ${gameId})`)
}

/** Da li automatika ima šta da radi (za „kick" iz get-view kad je stanje zaglavljeno). */
export function automationPending(ctx: Ctx): boolean {
  if (ctx.row.status !== 'active' || !ctx.state) return false
  const s = ctx.state
  if (s.phase === 'playing' && s.trick && s.trick.cards.length === activeSeatCount(s)) return true
  if (s.phase === 'claim') return true
  const actor = currentActor(s)
  if (actor === null) return false
  return ctx.players.some((p) => p.seat === actor && p.is_bot)
}

/** Redigovan pogled za konkretnog korisnika (igrač → svoje mesto, ostali → posmatrač). */
export function buildView(ctx: Ctx, userId: string): ViewResponse {
  const me = ctx.players.find((p) => p.user_id === userId) ?? null
  const seat = me !== null ? (me.seat as Seat) : null
  return {
    game: {
      id: ctx.row.id,
      code: ctx.row.code,
      status: ctx.row.status,
      version: ctx.version,
      handNo: ctx.row.hand_no,
      phase: ctx.row.phase,
      currentActor: (ctx.row.current_actor ?? null) as Seat | null,
      startingBule: ctx.row.config.startingBule ?? 40,
      seats: ctx.row.config.seats,
      players: ctx.players.map((p) => ({
        seat: p.seat as Seat,
        displayName: p.display_name,
        isBot: p.is_bot,
      })),
      youAreCreator: ctx.row.created_by === userId,
      startedAt: ctx.row.started_at ?? null,
    },
    role: me ? 'player' : 'spectator',
    mySeat: seat,
    state: ctx.state ? redactStateFor(seat, ctx.state) : null,
  }
}

/** Upsert display_name u profiles (izvor imena za „Moje partije"). */
export async function upsertProfileName(
  admin: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<void> {
  const { error } = await admin
    .from('profiles')
    .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
  if (error) console.error('[profile]', error.message)
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 20) : ''
  if (!name) throw new HttpError(400, 'Unesi ime (1–20 znakova)')
  return name
}
