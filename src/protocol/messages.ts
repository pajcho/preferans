// ─────────────────────────────────────────────────────────────
// Wire poruke klijent ↔ Cloudflare Worker/GameRoom DO (Faza 2 — online).
// VAŽNO: uvozi ga i worker (workers/src) — sme da importuje SAMO engine relativno.
// REST: auth/create/join/mine/view/cancel; WebSocket: view push + potezi.
// ─────────────────────────────────────────────────────────────
import type { Action, Config, Difficulty, GameState, Seat, Trip } from '../engine/index.ts'

export type GameStatus = 'lobby' | 'active' | 'finished' | 'abandoned'

/** Zapis u DO logu poteza: engine Action + sintetički INIT (podela na startu partije). */
export type LoggedAction = Action | { type: 'INIT'; seed: number; config: Config }

export type SeatConfig = { type: 'human' } | { type: 'bot'; difficulty: Difficulty }
export type SeatsConfig = [SeatConfig, SeatConfig, SeatConfig]

export interface PlayerInfo {
  seat: Seat
  displayName: string
  isBot: boolean
}

/** Igrač u čekaonici (lobi je pun) — redosled u nizu = prioritet za upad. */
export interface WaitingInfo {
  displayName: string
  /** ima otvorenu WS konekciju — samo povezani upadaju kad se oslobodi mesto */
  connected: boolean
}

/**
 * Aktivan predlog prekida partije (redigovano po gledaocu). Botovi se uvek slažu;
 * čeka se samo na POVEZANE ljude za stolom. Kad svih „mora da glasa" kažu Da → prekid;
 * bilo koje Ne → predlog otpada i partija se nastavlja (poruka `abandonNote`).
 */
export interface AbandonInfo {
  /** sedište onoga ko je predložio prekid */
  by: Seat
  /** saigrači (ljudi) koji su se već složili */
  agreed: Seat[]
  /** saigrači (ljudi) od kojih se još čeka odgovor */
  waitingOn: Seat[]
  /** ti si predlagač (vidiš „Povuci predlog") */
  youProposed: boolean
  /** od tebe se traži glas (vidiš Da/Ne) */
  youMustVote: boolean
}

/** POST /api/games/:code/abandon — odluka o prekidu. */
export type AbandonDecision = 'propose' | 'agree' | 'reject' | 'withdraw'
export interface AbandonRequest {
  decision: AbandonDecision
}
export interface AbandonResponse {
  /** ishod: prekinuta / odbijena / još se čeka / nema predloga */
  resolved: 'abandoned' | 'rejected' | 'pending' | 'none'
}

export interface GameMeta {
  code: string
  status: GameStatus
  version: number
  handNo: number
  phase: string | null
  currentActor: Seat | null
  startingBule: number
  /** maksimalan broj refea po igraču (0 = bez refea) */
  maxRefe: number
  seats: SeatsConfig
  players: PlayerInfo[]
  /** čekaonica — ko čeka mesto dok je lobi pun (samo u lobiju, posle starta prazno) */
  waiting: WaitingInfo[]
  youAreCreator: boolean
  /** tvoja pozicija u čekaonici (1 = sledeći upada; null ako ne čekaš) */
  yourWaitingPos: number | null
  /** ISO timestamp početka partije (null u lobiju) */
  startedAt: string | null
  /** aktivan predlog prekida partije (null kad nema); partija je pauzirana dok stoji */
  abandon: AbandonInfo | null
  /** poruka „na talonu" kad je predlog prekida odbijen (transient, skida se prvim potezom) */
  abandonNote: string | null
}

/** Odgovor view/WS push: metapodaci + redigovan GameState (null u lobiju). */
export interface ViewResponse {
  game: GameMeta
  role: 'player' | 'spectator'
  mySeat: Seat | null
  state: GameState | null
}

/** POST /api/auth/anon — anonimni identitet (HMAC potpisan token, čuva se u localStorage). */
export interface AuthResponse {
  userId: string
  token: string
}

// ── Nalozi (opciona nadogradnja anonimnog identiteta) ──

/** POST /api/auth/register — veže email+lozinku za TRENUTNI userId (istorija ostaje). */
export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

/** POST /api/auth/login — vraća identitet naloga (isti userId/token na svakom uređaju). */
export interface LoginRequest {
  email: string
  password: string
}

/** Odgovor register/login: pun identitet + podaci naloga. */
export interface AccountResponse {
  userId: string
  token: string
  email: string
  displayName: string
}

/** GET /api/auth/me — status naloga za trenutni identitet. */
export interface MeResponse {
  userId: string
  registered: boolean
  email: string | null
  displayName: string | null
}

/** POST /api/auth/profile — izmena profila (svako polje opciono; newPassword traži currentPassword). */
export interface UpdateProfileRequest {
  displayName?: string
  email?: string
  newPassword?: string
  currentPassword?: string
}

export interface CreateGameRequest {
  /** opciono — anonimni identitet je pravi ID; server dodeli placeholder ako fali */
  displayName?: string
  /** default: kreator + 2 slobodna mesta (sve 'human') — podešava se posle u lobiju */
  seats?: SeatsConfig
  startingBule?: number
  maxRefe?: number
}
export interface CreateGameResponse {
  code: string
  seat: Seat
  status: GameStatus
}

export interface JoinGameRequest {
  code: string
  displayName: string
}
export interface JoinGameResponse {
  code: string
  role: 'player' | 'spectator'
  seat: Seat | null
  status: GameStatus
  /** pozicija u čekaonici ako je lobi pun (1 = sledeći upada) */
  waitingPos?: number | null
}

/** POST /api/games/:code/config — samo kreator, samo dok je partija u lobiju. */
export interface ConfigureGameRequest {
  /** mesto koje se menja (mora uz seatConfig); zauzeto (pravi igrač) ne može da se menja */
  seat?: Seat
  seatConfig?: SeatConfig
  startingBule?: number
  maxRefe?: number
}

/** Stavka liste „Moje partije" (GET /api/games/mine, iz D1). */
export interface MyGame {
  code: string
  status: GameStatus
  phase: string | null
  handNo: number
  currentActor: Seat | null
  updatedAt: string
  mySeat: Seat | null
  players: PlayerInfo[]
}

// ── Istorija završenih partija (server-backed; zamena za nekadašnju lokalnu istoriju) ──

/** Stavka liste istorije (GET /api/games/history). Imena su TRENUTNA (iz players tabele). */
export interface HistoryGameItem {
  code: string
  /** 'finished' (odigrana do kraja) ili 'abandoned' (prekinuta u toku) */
  status: Extract<GameStatus, 'finished' | 'abandoned'>
  handCount: number
  startedAt: string | null
  finishedAt: string | null
  mySeat: Seat | null
  players: PlayerInfo[]
  /** konačni rezultat po sedištu (finalScore); null za prekinute partije */
  scores: Trip<number> | null
}

export interface ReplayPlayer {
  seat: Seat
  displayName: string
  isBot: boolean
  botDifficulty: Difficulty | null
}

/** GET /api/games/:code/replay — pun log ZAVRŠENE partije (samo učesnik) za rekonstrukciju. */
export interface GameReplayResponse {
  code: string
  mySeat: Seat | null
  players: ReplayPlayer[]
  startingBule: number
  startedAt: string | null
  finishedAt: string | null
  /** INIT (seed+config) + sve engine akcije po redu — klijent rekonstruiše kroz engine */
  actions: LoggedAction[]
}

// ── WebSocket (wss://…/api/games/:code/ws?token=…) ──

/** Klijent → server. Potezi idu kroz WS; reqId veže ack/error za poziv. */
export type ClientMessage = { type: 'act'; reqId: string; action: Action } | { type: 'sync' }

/** Server → klijent. Posle svake promene server gura redigovan view SVAKOM po njegovom sedištu. */
export type ServerMessage =
  | { type: 'view'; view: ViewResponse }
  | { type: 'presence'; seats: Seat[] }
  | { type: 'ack'; reqId: string }
  | { type: 'error'; reqId?: string; message: string }

export interface ApiError {
  error: string
  code?: string
}
