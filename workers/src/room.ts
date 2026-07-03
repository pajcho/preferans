// ─────────────────────────────────────────────────────────────
// GameRoom = autoritet JEDNE partije (1 partija = 1 Durable Object, ime = kod).
// Drži pun GameState + append-only log poteza u svom SQLite storage-u,
// WebSocket konekcije (Hibernation API) kroz koje gura redigovan view
// svakom klijentu po njegovom sedištu, i bot automatiku preko DO Alarms
// sa serverskim tempom (0.8s potez / 1.6s štih / 3.5s claim).
// Potezi su serijalizovani prirodom DO-a — nema potrebe za CAS.
// ─────────────────────────────────────────────────────────────
import { DurableObject } from 'cloudflare:workers'
import {
  DEFAULT_CONFIG,
  activeSeatCount,
  chooseAction,
  createGame,
  currentActor,
  finalScore,
  reduce,
  redactStateFor,
} from '../../src/engine/index.ts'
import type { Action, Difficulty, GameState, Seat, Trip } from '../../src/engine/index.ts'
import type {
  ClientMessage,
  CreateGameResponse,
  GameStatus,
  JoinGameResponse,
  SeatsConfig,
  ServerMessage,
  ViewResponse,
} from '../../src/protocol/messages.ts'
import { randomInt, randomSeed } from './random.ts'

const BOT_NAMES = ['Pera', 'Laza', 'Mika'] as const

// serverski tempo — isti kao u vs-cpu UI-ju
const DELAY_MOVE_MS = 800
const DELAY_TRICK_MS = 1600
const DELAY_CLAIM_MS = 3500

export interface PlayerRec {
  seat: Seat
  userId: string | null
  displayName: string
  isBot: boolean
  botDifficulty: Difficulty | null
}

export interface RoomMeta {
  code: string
  status: GameStatus
  createdBy: string
  startingBule: number
  seats: SeatsConfig
  players: PlayerRec[]
  version: number
  handNo: number
  phase: string | null
  currentActor: Seat | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  summary: { scores: Trip<number> } | null
}

/** RPC rezultat — greške nose HTTP status umesto bacanja preko RPC granice. */
export type RoomResult<T> = { ok: true; value: T } | { ok: false; status: number; message: string }

const ok = <T>(value: T): RoomResult<T> => ({ ok: true, value })
const err = <T = never>(status: number, message: string): RoomResult<T> => ({ ok: false, status, message })

interface ActionRow {
  [k: string]: SqlStorageValue
  seq: number
  hand_no: number
  seat: number | null
  action: string
}

function summarize(state: GameState): { scores: Trip<number> } {
  const seats: Seat[] = [0, 1, 2]
  const scores = seats.map((s) => {
    const others = seats.filter((o) => o !== s)
    const supaFor = others.reduce((sum: number, o) => sum + state.ledger.supe[s][o], 0)
    const supaAgainst = others.reduce((sum: number, o) => sum + state.ledger.supe[o][s], 0)
    return finalScore(state.ledger.bule[s], supaFor, supaAgainst)
  }) as [number, number, number]
  return { scores }
}

export class GameRoom extends DurableObject<Env> {
  private meta: RoomMeta | null = null
  private state: GameState | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS actions (
          seq INTEGER PRIMARY KEY,
          hand_no INTEGER NOT NULL,
          seat INTEGER,
          action TEXT NOT NULL,
          at TEXT NOT NULL
        )
      `)
      this.meta = (await ctx.storage.get<RoomMeta>('meta')) ?? null
      this.state = (await ctx.storage.get<GameState>('state')) ?? null
    })
    // keepalive bez buđenja DO-a iz hibernacije
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  // ── RPC: kreiranje partije ──

  async create(req: {
    code: string
    createdBy: string
    displayName: string
    seats: SeatsConfig
    startingBule: number
  }): Promise<RoomResult<CreateGameResponse>> {
    if (this.meta) return err(409, 'code-collision')

    const humanSeats = ([0, 1, 2] as const).filter((i) => req.seats[i].type === 'human')
    const creatorSeat = humanSeats[randomInt(humanSeats.length)]
    const players: PlayerRec[] = [
      { seat: creatorSeat, userId: req.createdBy, displayName: req.displayName, isBot: false, botDifficulty: null },
      ...([0, 1, 2] as const)
        .filter((i) => req.seats[i].type === 'bot')
        .map((i): PlayerRec => {
          const cfg = req.seats[i] as { type: 'bot'; difficulty: Difficulty }
          return { seat: i, userId: null, displayName: BOT_NAMES[i], isBot: true, botDifficulty: cfg.difficulty }
        }),
    ].sort((a, b) => a.seat - b.seat)

    this.meta = {
      code: req.code,
      status: 'lobby',
      createdBy: req.createdBy,
      startingBule: req.startingBule,
      seats: req.seats,
      players,
      version: 0,
      handNo: 0,
      phase: null,
      currentActor: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      summary: null,
    }
    this.persist()

    // jedini čovek? — odmah start (botovi sedaju odmah)
    if (humanSeats.length === 1) this.startGame()
    this.syncD1(true)

    return ok({ code: req.code, seat: creatorSeat, status: this.meta.status })
  }

  // ── RPC: priključivanje kodom ──

  async join(req: { userId: string; displayName: string }): Promise<RoomResult<JoinGameResponse>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.status === 'abandoned') return err(410, 'Partija je otkazana')

    const respond = (role: 'player' | 'spectator', seat: Seat | null): RoomResult<JoinGameResponse> =>
      ok({ code: m.code, role, seat, status: m.status })

    // već sedi za stolom → reconnect
    const existing = m.players.find((p) => p.userId === req.userId)
    if (existing) return respond('player', existing.seat)

    if (m.status !== 'lobby') return respond('spectator', null)

    const taken = new Set(m.players.map((p) => p.seat))
    const free = ([0, 1, 2] as const).filter((i) => m.seats[i].type === 'human' && !taken.has(i))
    if (free.length === 0) return respond('spectator', null)

    const seat = free[randomInt(free.length)]
    m.players.push({ seat, userId: req.userId, displayName: req.displayName, isBot: false, botDifficulty: null })
    m.players.sort((a, b) => a.seat - b.seat)
    this.persist()

    if (free.length === 1) {
      this.startGame() // poslednje mesto popunjeno — startGame gura view svima
    } else {
      this.pushViews()
    }
    this.broadcastPresence()
    this.syncD1(true)

    return respond('player', seat)
  }

  // ── RPC: otkazivanje (samo kreator) ──

  async cancel(userId: string): Promise<RoomResult<{ ok: true }>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.createdBy !== userId) return err(403, 'Samo kreator može da otkaže partiju')
    if (m.status === 'finished') return err(409, 'Partija je već završena')

    m.status = 'abandoned'
    m.finishedAt = new Date().toISOString()
    this.persist()
    void this.ctx.storage.deleteAlarm()
    this.pushViews()
    this.syncD1()
    return ok({ ok: true })
  }

  // ── RPC: redigovan pogled (REST /view — jednokratno; klijent inače živi na WS push-u) ──

  async view(userId: string): Promise<RoomResult<ViewResponse>> {
    if (!this.meta) return err(404, 'Partija nije pronađena')
    await this.kickAutomationIfStalled()
    return ok(this.buildView(userId))
  }

  /** Debug uvid za E2E (router ga izlaže samo uz DEBUG_API=1). */
  async debugInfo(): Promise<{
    meta: RoomMeta | null
    actions: { seq: number; handNo: number; seat: number | null; action: Action }[]
  }> {
    const rows = this.ctx.storage.sql
      .exec<ActionRow>('SELECT seq, hand_no, seat, action FROM actions ORDER BY seq ASC')
      .toArray()
    return {
      meta: this.meta,
      actions: rows.map((r) => ({
        seq: r.seq,
        handNo: r.hand_no,
        seat: (r.seat ?? null) as number | null,
        action: JSON.parse(r.action) as Action,
      })),
    }
  }

  // ── WebSocket: upgrade (worker je već verifikovao token i prosledio x-user-id) ──

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Očekivan WebSocket upgrade', { status: 426 })
    }
    const userId = request.headers.get('x-user-id')
    if (!userId) return new Response('Nedostaje autorizacija', { status: 401 })
    if (!this.meta) return new Response('Partija nije pronađena', { status: 404 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server, [userId])
    server.serializeAttachment({ userId })

    this.send(server, { type: 'view', view: this.buildView(userId) })
    this.broadcastPresence()
    await this.kickAutomationIfStalled()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const att = ws.deserializeAttachment() as { userId?: string } | null
    const userId = att?.userId
    if (!userId) return

    let msg: ClientMessage
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMessage
    } catch {
      this.send(ws, { type: 'error', message: 'Neispravna poruka' })
      return
    }

    if (msg.type === 'sync') {
      if (this.meta) this.send(ws, { type: 'view', view: this.buildView(userId) })
      this.send(ws, { type: 'presence', seats: this.presenceSeats() })
      await this.kickAutomationIfStalled()
      return
    }

    if (msg.type === 'act') {
      const result = await this.act(userId, msg.action)
      if (result.ok) this.send(ws, { type: 'ack', reqId: msg.reqId })
      else this.send(ws, { type: 'error', reqId: msg.reqId, message: result.message })
    }
  }

  async webSocketClose(): Promise<void> {
    this.broadcastPresence()
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence()
  }

  // ── Alarm: bot potezi + zatvaranje štiha + finalizacija claim-a ──

  async alarm(): Promise<void> {
    const step = this.automationStep()
    if (!step) return
    const result = this.applyAction(step.action, step.seat)
    // applyAction je zakazao sledeći korak; greška ovde znači bug u engine-u —
    // loguj i stani (alarm retry ne bi pomogao za deterministički neispravan potez)
    if (!result.ok) console.error('[automation]', this.meta?.code, result.message)
  }

  // ── interno ──

  private buildView(userId: string): ViewResponse {
    const m = this.meta!
    const me = m.players.find((p) => p.userId === userId) ?? null
    const seat = me ? me.seat : null
    return {
      game: {
        code: m.code,
        status: m.status,
        version: m.version,
        handNo: m.handNo,
        phase: m.phase,
        currentActor: m.currentActor,
        startingBule: m.startingBule,
        seats: m.seats,
        players: m.players.map((p) => ({ seat: p.seat, displayName: p.displayName, isBot: p.isBot })),
        youAreCreator: m.createdBy === userId,
        startedAt: m.startedAt,
      },
      role: me ? 'player' : 'spectator',
      mySeat: seat,
      state: this.state ? redactStateFor(seat, this.state) : null,
    }
  }

  /** RPC + WS: potez igrača, autorizovan po sedištu. */
  async act(userId: string, rawAction: Action): Promise<RoomResult<null>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    const me = m.players.find((p) => p.userId === userId)
    if (!me) return err(403, 'Ne sediš za ovim stolom')
    const mySeat = me.seat

    if (!rawAction || typeof rawAction.type !== 'string') return err(400, 'Nedostaje action')
    const action = { ...rawAction } as Action
    switch (action.type) {
      case 'RESOLVE_TRICK':
      case 'FINALIZE_CLAIM':
        return err(403, 'Ovaj potez primenjuje server')
      case 'NEXT_HAND':
        break // bilo koji igrač sme da nastavi na sledeću ruku
      case 'PROCEED':
        action.seat = mySeat // seat je opcion — uvek ga vežemo za pozivaoca
        break
      default:
        if (action.seat !== mySeat) return err(403, 'Ne možeš da igraš tuđ potez')
    }
    return this.applyAction(action, mySeat)
  }

  /** Podeli karte i aktiviraj partiju (sva mesta popunjena). */
  private startGame(): void {
    const m = this.meta
    if (!m || m.status !== 'lobby') return

    const seed = randomSeed()
    const config = { ...DEFAULT_CONFIG, startingBule: m.startingBule }
    const state = createGame(config, seed, 0)

    this.state = state
    m.status = 'active'
    m.startedAt = new Date().toISOString()
    m.version = 1
    m.phase = state.phase
    m.handNo = state.handNo
    m.currentActor = currentActor(state)

    this.ctx.storage.sql.exec(
      'INSERT INTO actions (seq, hand_no, seat, action, at) VALUES (?, ?, ?, ?, ?)',
      1,
      1,
      null,
      JSON.stringify({ type: 'INIT', seed, config }),
      new Date().toISOString(),
    )
    this.persist()

    this.pushViews()
    this.syncD1()
    this.scheduleAutomation()
  }

  /**
   * Primeni JEDAN potez: engine reduce validira (baca na nelegalne), verzija raste,
   * potez ide u append-only log, view se gura svima, meta u D1, automatika se zakazuje.
   */
  private applyAction(action: Action, actorSeat: Seat | null): RoomResult<null> {
    const m = this.meta
    if (!m || m.status !== 'active' || !this.state) return err(409, 'Partija nije aktivna')

    let next: GameState
    try {
      next = reduce(this.state, action)
    } catch (e) {
      return err(400, e instanceof Error ? e.message : 'Nedozvoljen potez')
    }

    const newVersion = m.version + 1
    this.ctx.storage.sql.exec(
      'INSERT INTO actions (seq, hand_no, seat, action, at) VALUES (?, ?, ?, ?, ?)',
      newVersion,
      this.state.handNo,
      actorSeat,
      JSON.stringify(action),
      new Date().toISOString(),
    )

    this.state = next
    m.version = newVersion
    m.phase = next.phase
    m.handNo = next.handNo
    m.currentActor = currentActor(next)
    if (next.phase === 'gameOver') {
      m.status = 'finished'
      m.finishedAt = new Date().toISOString()
      m.summary = summarize(next)
    }
    this.persist()

    this.pushViews()
    this.syncD1()
    this.scheduleAutomation()
    return ok(null)
  }

  /** Upis meta+state u DO storage (bez await-a između — piše se atomično, output gate čuva odgovor). */
  private persist(): void {
    if (this.meta) void this.ctx.storage.put('meta', this.meta)
    if (this.state) void this.ctx.storage.put('state', this.state)
  }

  /** Sledeći automatski korak (bot potez / zatvaranje štiha / claim) ili null. */
  private automationStep(): { action: Action; seat: Seat | null; delay: number } | null {
    const m = this.meta
    const s = this.state
    if (!m || m.status !== 'active' || !s) return null

    if (s.phase === 'playing' && s.trick && s.trick.cards.length === activeSeatCount(s)) {
      return { action: { type: 'RESOLVE_TRICK' }, seat: null, delay: DELAY_TRICK_MS }
    }
    if (s.phase === 'claim') {
      return { action: { type: 'FINALIZE_CLAIM' }, seat: null, delay: DELAY_CLAIM_MS }
    }
    if (s.phase === 'handScored' || s.phase === 'gameOver') return null

    const actor = currentActor(s)
    if (actor === null) return null
    const bot = m.players.find((p) => p.seat === actor && p.isBot)
    if (!bot) return null
    return {
      action: chooseAction(s, actor, bot.botDifficulty ?? 'medium'),
      seat: actor,
      delay: DELAY_MOVE_MS,
    }
  }

  private scheduleAutomation(): void {
    const step = this.automationStep()
    if (step) void this.ctx.storage.setAlarm(Date.now() + step.delay)
    else void this.ctx.storage.deleteAlarm()
  }

  /** Samoizlečenje: ako automatika ima posla a alarm ne postoji (npr. ručno obrisan storage), zakaži je. */
  private async kickAutomationIfStalled(): Promise<void> {
    if (!this.automationStep()) return
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null) this.scheduleAutomation()
  }

  /** Redigovan view SVAKOM priključenom klijentu (po njegovom sedištu). */
  private pushViews(): void {
    if (!this.meta) return
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { userId?: string } | null
      if (att?.userId) this.send(ws, { type: 'view', view: this.buildView(att.userId) })
    }
  }

  /** Mesta čiji su igrači trenutno online (≥1 otvorena WS konekcija). */
  private presenceSeats(): Seat[] {
    if (!this.meta) return []
    const online = new Set<string>()
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { userId?: string } | null
      if (att?.userId) online.add(att.userId)
    }
    return this.meta.players.filter((p) => p.userId && online.has(p.userId)).map((p) => p.seat)
  }

  private broadcastPresence(): void {
    const msg: ServerMessage = { type: 'presence', seats: this.presenceSeats() }
    for (const ws of this.ctx.getWebSockets()) this.send(ws, msg)
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* konekcija je u zatvaranju — presence će se srediti kroz webSocketClose */
    }
  }

  /** Asinhroni upis metapodataka u D1 (lookup po kodu + „Moje partije"). */
  private syncD1(playersChanged = false): void {
    const m = this.meta
    if (!m) return
    const now = new Date().toISOString()
    const stmts: D1PreparedStatement[] = [
      this.env.DB.prepare(
        `INSERT INTO games (code, status, created_by, starting_bule, seats, phase, hand_no, current_actor, version, summary, created_at, started_at, finished_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           status = excluded.status, phase = excluded.phase, hand_no = excluded.hand_no,
           current_actor = excluded.current_actor, version = excluded.version, summary = excluded.summary,
           started_at = excluded.started_at, finished_at = excluded.finished_at, updated_at = excluded.updated_at`,
      ).bind(
        m.code,
        m.status,
        m.createdBy,
        m.startingBule,
        JSON.stringify(m.seats),
        m.phase,
        m.handNo,
        m.currentActor,
        m.version,
        m.summary ? JSON.stringify(m.summary) : null,
        m.createdAt,
        m.startedAt,
        m.finishedAt,
        now,
      ),
    ]
    if (playersChanged) {
      stmts.push(this.env.DB.prepare('DELETE FROM game_players WHERE code = ?').bind(m.code))
      for (const p of m.players) {
        stmts.push(
          this.env.DB.prepare(
            'INSERT INTO game_players (code, seat, user_id, display_name, is_bot, bot_difficulty) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(m.code, p.seat, p.userId, p.displayName, p.isBot ? 1 : 0, p.botDifficulty),
        )
      }
    }
    this.ctx.waitUntil(
      this.env.DB.batch(stmts).then(
        () => {},
        (e: unknown) => console.error('[d1sync]', m.code, e),
      ),
    )
  }
}
