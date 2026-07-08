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
import type { Action, Difficulty, GameState, HandResult, Seat, Trip } from '../../src/engine/index.ts'
import type {
  AbandonDecision,
  AbandonInfo,
  AbandonResponse,
  ClientMessage,
  ConfigureGameRequest,
  CreateGameResponse,
  GameStatus,
  JoinGameResponse,
  LoggedAction,
  SeatConfig,
  SeatsConfig,
  ServerMessage,
  ViewResponse,
} from '../../src/protocol/messages.ts'
import { buildReplayHands } from '../../src/history/replay.ts'
import type { GameHistoryHand } from '../../src/history/types.ts'
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

/** Čekaonica: priključio se kodom dok je lobi pun — čeka da se oslobodi mesto (FIFO). */
export interface WaitingRec {
  userId: string
  displayName: string
  joinedAt: string
}

/**
 * Predlog prekida partije (session sloj, van engine-a — ne ide u log poteza).
 * Predlagač je uvek 'yes'; ostali ljudi glasaju, botovi se podrazumevaju 'yes'.
 * Dok stoji, automatika je pauzirana i ljudski potezi su odbijeni.
 */
export interface AbandonProposal {
  by: Seat
  votes: Record<number, 'yes' | 'no'>
}

export interface RoomMeta {
  code: string
  status: GameStatus
  createdBy: string
  startingBule: number
  maxRefe: number
  seats: SeatsConfig
  players: PlayerRec[]
  waiting: WaitingRec[]
  version: number
  handNo: number
  phase: string | null
  currentActor: Seat | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  summary: { scores: Trip<number> } | null
  /** aktivan predlog prekida (pauzira partiju) ili null */
  abandon: AbandonProposal | null
  /** poruka „na talonu" posle odbijenog predloga (transient) ili null */
  abandonNote: string | null
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
  at: string
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
      if (this.meta) {
        // partije upisane pre uvođenja podešavanja/čekaonice/prekida nemaju ova polja
        this.meta.maxRefe ??= 1
        this.meta.waiting ??= []
        this.meta.abandon ??= null
        this.meta.abandonNote ??= null
      }
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
    maxRefe: number
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
      maxRefe: req.maxRefe,
      seats: req.seats,
      players,
      waiting: [],
      version: 0,
      handNo: 0,
      phase: null,
      currentActor: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      summary: null,
      abandon: null,
      abandonNote: null,
    }
    this.persist()
    this.syncD1(true)

    // partija VIŠE ne startuje sama — kreator podesi mesta/pravila u lobiju pa klikne start
    return ok({ code: req.code, seat: creatorSeat, status: this.meta.status })
  }

  // ── RPC: priključivanje kodom ──

  async join(req: { userId: string; displayName: string }): Promise<RoomResult<JoinGameResponse>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.status === 'abandoned') return err(410, 'Partija je otkazana')

    const respond = (
      role: 'player' | 'spectator',
      seat: Seat | null,
      waitingPos: number | null = null,
    ): RoomResult<JoinGameResponse> => ok({ code: m.code, role, seat, status: m.status, waitingPos })

    // već sedi za stolom → reconnect
    const existing = m.players.find((p) => p.userId === req.userId)
    if (existing) return respond('player', existing.seat)

    if (m.status !== 'lobby') return respond('spectator', null)

    const taken = new Set(m.players.map((p) => p.seat))
    const free = ([0, 1, 2] as const).filter((i) => m.seats[i].type === 'human' && !taken.has(i))

    if (free.length === 0) {
      // lobi je pun → čekaonica (FIFO); ponovljen join samo osveži ime
      const queued = m.waiting.find((w) => w.userId === req.userId)
      if (queued) {
        queued.displayName = req.displayName
      } else {
        m.waiting.push({ userId: req.userId, displayName: req.displayName, joinedAt: new Date().toISOString() })
      }
      this.persist()
      this.pushViews()
      return respond('spectator', null, m.waiting.findIndex((w) => w.userId === req.userId) + 1)
    }

    const seat = free[randomInt(free.length)]
    m.players.push({ seat, userId: req.userId, displayName: req.displayName, isBot: false, botDifficulty: null })
    m.players.sort((a, b) => a.seat - b.seat)
    m.waiting = m.waiting.filter((w) => w.userId !== req.userId)
    this.persist()

    this.pushViews()
    this.broadcastPresence()
    this.syncD1(true)

    return respond('player', seat)
  }

  // ── RPC: podešavanje lobija (samo kreator): mesta igrač/bot i pravila (bule/refe) ──

  async configure(userId: string, patch: ConfigureGameRequest): Promise<RoomResult<null>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.createdBy !== userId) return err(403, 'Samo kreator podešava partiju')
    if (m.status !== 'lobby') return err(409, 'Partija je već počela — podešavanje nije moguće')

    let playersChanged = false

    if (patch.seat !== undefined && patch.seatConfig) {
      const seat = patch.seat
      const cfg: SeatConfig = patch.seatConfig
      const occupant = m.players.find((p) => p.seat === seat)
      if (occupant && !occupant.isBot) {
        return err(409, 'Mesto je zauzeto — može da se menja samo prazno ili bot mesto')
      }
      m.seats[seat] = cfg
      m.players = m.players.filter((p) => p.seat !== seat)
      if (cfg.type === 'bot') {
        m.players.push({ seat, userId: null, displayName: BOT_NAMES[seat], isBot: true, botDifficulty: cfg.difficulty })
        m.players.sort((a, b) => a.seat - b.seat)
      }
      playersChanged = true
    }

    if (patch.startingBule !== undefined) m.startingBule = patch.startingBule
    if (patch.maxRefe !== undefined) m.maxRefe = patch.maxRefe

    // mesto možda otvoreno za igrača → prvi POVEZANI iz čekaonice odmah seda
    if (this.seatFromWaiting()) playersChanged = true

    this.persist()
    this.pushViews()
    this.broadcastPresence()
    this.syncD1(playersChanged)
    return ok(null)
  }

  // ── RPC: izlazak iz čekaonice ili ustajanje sa mesta (samo dok je lobi) ──

  async leave(userId: string): Promise<RoomResult<null>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.status !== 'lobby') return err(409, 'Partija je već počela')

    const seated = m.players.find((p) => p.userId === userId)
    const inQueue = m.waiting.some((w) => w.userId === userId)
    if (!seated && !inQueue) return ok(null) // nema šta da se napusti — idempotentno

    if (seated && m.createdBy === userId) {
      return err(403, 'Kreator ne napušta sto — otkaži partiju')
    }

    let playersChanged = false
    if (seated) {
      m.players = m.players.filter((p) => p.userId !== userId)
      playersChanged = true
    }
    m.waiting = m.waiting.filter((w) => w.userId !== userId)

    // oslobođeno mesto odmah nudi sledećem POVEZANOM iz čekaonice
    if (this.seatFromWaiting()) playersChanged = true

    this.persist()
    this.pushViews()
    this.broadcastPresence()
    this.syncD1(playersChanged)
    return ok(null)
  }

  // ── RPC: start partije (samo kreator, sva mesta popunjena) ──

  async start(userId: string): Promise<RoomResult<null>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.createdBy !== userId) return err(403, 'Samo kreator startuje partiju')
    if (m.status !== 'lobby') return err(409, 'Partija je već počela')

    const taken = new Set(m.players.map((p) => p.seat))
    if (([0, 1, 2] as const).some((i) => !taken.has(i))) {
      return err(409, 'Nisu popunjena sva mesta — sačekaj igrače ili postavi kompjuter')
    }

    m.waiting = [] // preostali iz čekaonice postaju posmatrači
    this.startGame()
    this.syncD1(true)
    return ok(null)
  }

  // ── RPC: otkazivanje lobija (samo kreator, pre starta) ──

  async cancel(userId: string): Promise<RoomResult<{ ok: true }>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.createdBy !== userId) return err(403, 'Samo kreator može da otkaže partiju')
    // aktivna partija se prekida kroz „Napusti partiju" (saglasnost igrača), ne otkazivanjem
    if (m.status !== 'lobby') return err(409, 'Partija je već počela — prekid ide preko „Napusti partiju"')

    m.status = 'abandoned'
    m.finishedAt = new Date().toISOString()
    this.persist()
    void this.ctx.storage.deleteAlarm()
    this.pushViews()
    this.syncD1()
    return ok({ ok: true })
  }

  // ── RPC: prekid aktivne partije uz saglasnost (botovi se uvek slažu) ──

  async abandon(userId: string, decision: AbandonDecision): Promise<RoomResult<AbandonResponse>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    if (m.status !== 'active') return err(409, 'Partija nije aktivna')
    const me = m.players.find((p) => p.userId === userId)
    if (!me || me.isBot) return err(403, 'Ne sediš za ovim stolom')
    const seat = me.seat

    switch (decision) {
      case 'propose': {
        if (m.abandon) {
          // predlog već postoji — obavezan glasač time potvrđuje „Da"; predlagač čeka
          return seat === m.abandon.by ? ok({ resolved: 'pending' }) : this.recordAbandonVote(seat, 'yes')
        }
        m.abandon = { by: seat, votes: { [seat]: 'yes' } }
        m.abandonNote = null
        return this.resolveAbandon()
      }
      case 'agree':
        return this.recordAbandonVote(seat, 'yes')
      case 'reject':
        return this.recordAbandonVote(seat, 'no')
      case 'withdraw': {
        if (!m.abandon) return ok({ resolved: 'none' })
        if (m.abandon.by !== seat) return err(403, 'Samo predlagač povlači predlog')
        m.abandon = null
        this.persist()
        this.pushViews()
        this.scheduleAutomation() // nastavi partiju
        this.syncD1(false)
        return ok({ resolved: 'none' })
      }
    }
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

  /** Admin drill-down: meta + PUN state + ceo log poteza (samo /api/admin — vidi admin.ts). */
  async adminDump(): Promise<{
    meta: RoomMeta | null
    state: GameState | null
    connectedSeats: Seat[]
    actions: { seq: number; handNo: number; seat: Seat | null; action: Action; at: string }[]
  }> {
    if (!this.meta) return { meta: null, state: null, connectedSeats: [], actions: [] }
    const rows = this.ctx.storage.sql
      .exec<ActionRow>('SELECT seq, hand_no, seat, action, at FROM actions ORDER BY seq ASC')
      .toArray()
    return {
      meta: this.meta,
      state: this.state,
      connectedSeats: this.presenceSeats(),
      actions: rows.map((r) => ({
        seq: r.seq,
        handNo: r.hand_no,
        seat: (r.seat ?? null) as Seat | null,
        action: JSON.parse(r.action) as Action,
        at: r.at,
      })),
    }
  }

  /** Pun log poteza ZAVRŠENE partije (za rekonstrukciju istorije na klijentu). Autorizaciju
   *  učesnika radi router (D1); ovde je samo guard da se log aktivne partije ne procuri (karte). */
  async replayLog(): Promise<RoomResult<{ actions: LoggedAction[] }>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    // i prekinute (abandoned) partije se rekonstruišu u istoriji (odigrane ruke do prekida)
    if (m.status !== 'finished' && m.status !== 'abandoned') return err(409, 'Partija nije završena')
    const rows = this.ctx.storage.sql
      .exec<ActionRow>('SELECT seq, hand_no, seat, action, at FROM actions ORDER BY seq ASC')
      .toArray()
    return ok({ actions: rows.map((r) => JSON.parse(r.action) as LoggedAction) })
  }

  /** Obodovane (završene) ruke rekonstruisane iz loga — SERVER strana. Sigurno i za AKTIVNU
   *  partiju: buildReplayHands vraća SAMO završene ruke (tekuća ruka u toku nije uključena),
   *  pa se tuđe karte tekuće ruke ne otkrivaju. Klijent time puni „Prethodne ruke" posle
   *  reload-a/reconnect-a (in-memory lista se inače gubi). Autorizacija: router (isto kao /view). */
  async handsView(): Promise<RoomResult<{ hands: GameHistoryHand[] }>> {
    if (!this.meta) return err(404, 'Partija nije pronađena')
    const rows = this.ctx.storage.sql.exec<ActionRow>('SELECT action FROM actions ORDER BY seq ASC').toArray()
    return ok({ hands: buildReplayHands(rows.map((r) => JSON.parse(r.action) as LoggedAction)) })
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

    // povratak u lobi: ako čeka u čekaonici a mesto se oslobodilo dok je bio offline — seda odmah
    if (this.meta.status === 'lobby' && this.seatFromWaiting()) {
      this.persist()
      this.syncD1(true)
    }
    if (this.meta.status === 'lobby') {
      this.pushViews() // svima — „connected" status čekaonice se upravo promenio
    } else {
      this.send(server, { type: 'view', view: this.buildView(userId) })
    }
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
    if (this.meta?.status === 'lobby') this.pushViews() // osveži „connected" u čekaonici
    // glasač koji se odjavio više ne blokira predlog prekida — preračunaj ishod
    if (this.meta?.abandon) this.resolveAbandon()
  }

  async webSocketError(): Promise<void> {
    this.broadcastPresence()
    if (this.meta?.status === 'lobby') this.pushViews()
    if (this.meta?.abandon) this.resolveAbandon()
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
    const online = this.connectedUserIds()
    const waitingIdx = m.waiting.findIndex((w) => w.userId === userId)
    return {
      game: {
        code: m.code,
        status: m.status,
        version: m.version,
        handNo: m.handNo,
        phase: m.phase,
        currentActor: m.currentActor,
        startingBule: m.startingBule,
        maxRefe: m.maxRefe,
        seats: m.seats,
        players: m.players.map((p) => ({ seat: p.seat, displayName: p.displayName, isBot: p.isBot })),
        waiting: m.waiting.map((w) => ({ displayName: w.displayName, connected: online.has(w.userId) })),
        youAreCreator: m.createdBy === userId,
        yourWaitingPos: waitingIdx === -1 ? null : waitingIdx + 1,
        startedAt: m.startedAt,
        abandon: this.abandonInfoFor(seat),
        abandonNote: m.abandonNote,
      },
      role: me ? 'player' : 'spectator',
      mySeat: seat,
      state: this.state ? redactStateFor(seat, this.state) : null,
    }
  }

  /** Obavezni glasači predloga = ljudi za stolom osim predlagača (botovi se podrazumevaju „Da"). */
  private abandonRequiredSeats(prop: AbandonProposal): PlayerRec[] {
    return this.meta!.players.filter((p) => !p.isBot && p.seat !== prop.by)
  }

  /** Redigovan pogled predloga prekida za dato sedište (null kad nema predloga). */
  private abandonInfoFor(seat: Seat | null): AbandonInfo | null {
    const m = this.meta!
    if (!m.abandon) return null
    const required = this.abandonRequiredSeats(m.abandon)
    return {
      by: m.abandon.by,
      agreed: required.filter((p) => m.abandon!.votes[p.seat] === 'yes').map((p) => p.seat),
      waitingOn: required.filter((p) => m.abandon!.votes[p.seat] !== 'yes').map((p) => p.seat),
      youProposed: seat === m.abandon.by,
      youMustVote: seat !== null && required.some((p) => p.seat === seat) && m.abandon.votes[seat] !== 'yes',
    }
  }

  /** Zabeleži glas obaveznog glasača pa preračunaj ishod. */
  private recordAbandonVote(seat: Seat, vote: 'yes' | 'no'): RoomResult<AbandonResponse> {
    const m = this.meta!
    if (!m.abandon) return err(409, 'Nema aktivnog predloga za prekid')
    if (seat === m.abandon.by) return ok({ resolved: 'pending' }) // predlagač je već „Da"
    if (!this.abandonRequiredSeats(m.abandon).some((p) => p.seat === seat)) {
      return err(403, 'Ne možeš da glasaš o ovom predlogu')
    }
    m.abandon.votes[seat] = vote
    return this.resolveAbandon()
  }

  /**
   * Odluči o predlogu prekida: odbij na prvo „Ne"; prekini kad nijedan POVEZAN obavezni
   * glasač nije više neodlučan (offline se preskaču — inače rage-quit zamrzne sto).
   */
  private resolveAbandon(): RoomResult<AbandonResponse> {
    const m = this.meta!
    const prop = m.abandon
    if (!prop) return ok({ resolved: 'none' })
    const required = this.abandonRequiredSeats(prop)

    const rejecter = required.find((p) => prop.votes[p.seat] === 'no')
    if (rejecter) {
      m.abandon = null
      m.abandonNote = `${rejecter.displayName} se ne slaže sa prekidom — partija se nastavlja.`
      this.persist()
      this.pushViews()
      this.scheduleAutomation() // nastavi (bot potez / štih)
      this.syncD1(false)
      return ok({ resolved: 'rejected' })
    }

    const online = this.connectedUserIds()
    const pendingConnected = required.filter(
      (p) => prop.votes[p.seat] !== 'yes' && p.userId !== null && online.has(p.userId),
    )
    if (pendingConnected.length === 0) {
      this.doAbandon()
      return ok({ resolved: 'abandoned' })
    }

    // i dalje se čeka — automationStep vraća null dok predlog stoji (alarm se briše)
    this.persist()
    this.pushViews()
    this.scheduleAutomation()
    return ok({ resolved: 'pending' })
  }

  /** Prekid partije: status abandoned + sinhronizacija u D1 (izlazi iz „Moje partije", ulazi u istoriju). */
  private doAbandon(): void {
    const m = this.meta!
    m.status = 'abandoned'
    m.finishedAt = new Date().toISOString()
    m.abandon = null
    m.abandonNote = null
    this.persist()
    void this.ctx.storage.deleteAlarm()
    this.pushViews()
    this.syncD1()
  }

  /** RPC + WS: potez igrača, autorizovan po sedištu. */
  async act(userId: string, rawAction: Action): Promise<RoomResult<null>> {
    const m = this.meta
    if (!m) return err(404, 'Partija nije pronađena')
    const me = m.players.find((p) => p.userId === userId)
    if (!me) return err(403, 'Ne sediš za ovim stolom')
    const mySeat = me.seat

    if (m.abandon) return err(409, 'Partija je pauzirana — odlučuje se o prekidu partije')
    // prvi potez čoveka posle odbijenog predloga skida poruku sa talona
    if (m.abandonNote) m.abandonNote = null

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
    const config = { ...DEFAULT_CONFIG, startingBule: m.startingBule, maxRefe: m.maxRefe }
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

    // ruka upravo obodovana → red u D1 hands (analitika „šta se igra")
    if (next.lastHand && next.lastHand.handNo !== this.state.lastHand?.handNo) {
      this.recordHand(next.lastHand)
    }

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
    if (m.abandon) return null // partija je pauzirana dok se odlučuje o prekidu

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

  /** userId-jevi sa bar jednom otvorenom WS konekcijom. */
  private connectedUserIds(): Set<string> {
    const online = new Set<string>()
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as { userId?: string } | null
      if (att?.userId) online.add(att.userId)
    }
    return online
  }

  /** Mesta čiji su igrači trenutno online (≥1 otvorena WS konekcija). */
  private presenceSeats(): Seat[] {
    if (!this.meta) return []
    const online = this.connectedUserIds()
    return this.meta.players.filter((p) => p.userId && online.has(p.userId)).map((p) => p.seat)
  }

  /**
   * Dok postoji slobodno mesto za igrača i POVEZAN igrač u čekaonici — posadi ga (FIFO).
   * Nepovezani se preskaču ali ostaju u redu (upadaju kad se vrate, ako mesta još ima).
   * Vraća true ako je neko seo (pozivalac radi persist/push/sync).
   */
  private seatFromWaiting(): boolean {
    const m = this.meta
    if (!m || m.status !== 'lobby' || m.waiting.length === 0) return false
    const online = this.connectedUserIds()
    let changed = false
    for (;;) {
      const taken = new Set(m.players.map((p) => p.seat))
      const free = ([0, 1, 2] as const).filter((i) => m.seats[i].type === 'human' && !taken.has(i))
      if (free.length === 0) break
      const idx = m.waiting.findIndex((w) => online.has(w.userId))
      if (idx === -1) break
      const [next] = m.waiting.splice(idx, 1)
      m.players.push({
        seat: free[0],
        userId: next.userId,
        displayName: next.displayName,
        isBot: false,
        botDifficulty: null,
      })
      m.players.sort((a, b) => a.seat - b.seat)
      changed = true
    }
    return changed
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

  /** Asinhroni upis obodovane ruke u D1 hands (admin analitika). */
  private recordHand(hand: HandResult): void {
    const m = this.meta
    if (!m) return
    if (hand.kind !== 'played') return // refe (prazna ruka) nema ugovor — ne ide u „šta se igra"
    const declarer = m.players.find((p) => p.seat === hand.declarer)
    const contract = hand.contract.kind === 'suit' ? hand.contract.trump : hand.contract.kind
    this.ctx.waitUntil(
      this.env.DB.prepare(
        `INSERT OR REPLACE INTO hands
           (code, hand_no, declarer_seat, declarer_name, declarer_user_id, contract, as_igra, kontra, passed, played_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          m.code,
          hand.handNo,
          hand.declarer,
          declarer?.displayName ?? '?',
          declarer?.userId ?? null,
          contract,
          hand.contract.asGame ? 1 : 0,
          hand.kontra,
          hand.passed ? 1 : 0,
          new Date().toISOString(),
        )
        .run()
        .then(
          () => {},
          (e: unknown) => console.error('[hands]', m.code, e),
        ),
    )
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
