// ─────────────────────────────────────────────────────────────
// Tipovi engine-a. Bez import-a (čist temelj). Izvor pravila: docs/RULES.md
// ─────────────────────────────────────────────────────────────

export const SUITS = ['pik', 'karo', 'herc', 'tref'] as const
export type Suit = (typeof SUITS)[number]

// Rang u boji, slabije → jače (7 najslabiji, A najjači)
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
export type Rank = (typeof RANKS)[number]

export interface Card {
  suit: Suit
  rank: Rank
}

export type Seat = 0 | 1 | 2
export type Trip<T> = [T, T, T]

export interface PlayedCard {
  seat: Seat
  card: Card
}

// ─── Ugovori (igre) ───
export type SuitContract = { kind: 'suit'; trump: Suit }
export type BetlContract = { kind: 'betl' }
export type SansContract = { kind: 'sans' }
export type ContractKind = SuitContract | BetlContract | SansContract
/** asGame = "igra" (bez talona, vrednost +1) */
export type Contract = ContractKind & { asGame: boolean }

// Nivo licitacije: 2=pik,3=karo,4=herc,5=tref,6=betl,7=sans
export type BidLevel = 2 | 3 | 4 | 5 | 6 | 7
// 0=nema, 1=kontra(×2), 2=rekontra(×4), 3=subkontra(×8), 4=mortkontra(×16)
export type KontraLevel = 0 | 1 | 2 | 3 | 4

export interface BiddingState {
  /** redosled poteza od forehand-a */
  order: [Seat, Seat, Seat]
  toAct: Seat
  /** trenutni nivo (2..7) ili null pre prvog bida */
  level: BidLevel | null
  /** da li je trenutni vodeći bid „igra" (bez talona) */
  igra: boolean
  holder: Seat | null
  /** posle dizanja na 3+ čeka se da neko preuzme nivo ili kaže „dalje" */
  awaitingHold: boolean
  passed: Seat[]
  /** ko je već dao pozitivan bid (raise/hold/igra) — gejtuje „igra" na prvo javljanje */
  acted: Seat[]
}

/** Jedan iskaz u licitaciji (za istoriju/„spisak poteza"). */
export interface BidEntry {
  seat: Seat
  kind: 'pass' | 'raise' | 'hold' | 'igra' | 'invite' | 'kontra'
  level?: BidLevel
  /** za kind==='kontra': 1=kontra, 2=rekontra, 3=subkontra, 4=mortkontra */
  kontraLevel?: KontraLevel
}

export interface TrickState {
  leader: Seat
  cards: PlayedCard[]
}

export interface TalonReveal {
  takenBy: Seat
  cards: [Card, Card]
  acknowledged: Trip<boolean>
}

export interface CompletedTrick {
  cards: PlayedCard[]
  winner: Seat
}

/** Forsiran ishod ruke (auto-završetak): raspodela preostalih štihova + razlog. */
export interface ClaimInfo {
  add: Trip<number>
  winner: Seat | null
  /** 'claim'=vodeći nosi sve · 'betl'=betl nema pad · 'betl-fail'=betl pao (nosilac poneo štih) */
  reason: 'claim' | 'betl' | 'betl-fail'
}

export interface Ledger {
  /** srednja kolona (signed; negativno = bolje) po sedištu */
  bule: Trip<number>
  /** supe[from][against] — koliko je `from` upisao protiv `against` */
  supe: Trip<Trip<number>>
  /** neodigrani refe po igraču */
  refe: Trip<number>
}

export type ScoreHistoryEntry =
  | { kind: 'bule'; handNo: number; value: number; delta: number }
  | { kind: 'refe'; handNo: number; used: boolean }
  | { kind: 'hat'; handNo: number; crossed: boolean }

// ─── Kućna pravila (vidi docs/RULES.md §CONFIG) ───
export interface Config {
  startingBule: number
  maxRefe: number
  mandatoryKontraOnPik: boolean
  mustOvertrump: boolean
  mustHeadSuit: boolean
  /** odbrana piše najviše 5 štihova; ne-betl ruka se prekida čim odbrana skupi 5 */
  supaCap5: boolean
  /** automatski završi ruku kad je ishod forsiran („nosi sve" / „nema pad") */
  autoFinish: boolean
}

export const DEFAULT_CONFIG: Config = {
  startingBule: 100,
  maxRefe: 1,
  mandatoryKontraOnPik: true,
  mustOvertrump: false,
  mustHeadSuit: false,
  supaCap5: true,
  autoFinish: true,
}

export type Phase =
  | 'bidding'
  | 'talon'
  | 'following'
  | 'kontra'
  | 'playing'
  | 'claim'
  | 'handScored'
  | 'gameOver'

// Pun autoritativni state (reducer dolazi u sledećem koraku)
export interface GameState {
  config: Config
  seed: number
  rngState: number
  handNo: number
  dealer: Seat
  phase: Phase
  hands: Trip<Card[]>
  talon: Card[]
  /** javno otvoren talon koji ostaje vidljiv dok ga svi potrebni igrači ne potvrde */
  talonReveal: TalonReveal | null
  discard: Card[]
  talonTaken: boolean
  bidding: BiddingState | null
  /** ceo tok licitacije ove ruke (ostaje i posle licitacije, za prikaz) */
  bidLog: BidEntry[]
  wonLevel: BidLevel | null
  /** licitacija dobijena kao „igra" (bez talona) */
  wonAsIgra: boolean
  declarer: Seat | null
  contract: Contract | null
  following: Trip<boolean>
  /** pratilac koji je pozvao nepratioca; pozvani je pomoćnik bez sopstvenog upisa */
  inviteCaller: Seat | null
  followToAct: Seat | null
  kontra: KontraLevel
  /** pratilac koji trenutno nosi odgovornost za kontru/subkontru */
  kontraBy: Seat | null
  /** ko je na potezu u fazi kontre (null van te faze) */
  kontraToAct: Seat | null
  /** pratioci koji su pre prve kontre rekli „može" */
  kontraPassed: Seat[]
  trick: TrickState | null
  tricksLog: CompletedTrick[]
  /** forsiran ishod (auto-završetak); null osim u fazi 'claim' */
  claim: ClaimInfo | null
  tricksWon: Trip<number>
  tricksPlayed: number
  ledger: Ledger
  /** istorija srednje kolone: skidanja/dodavanja bula, refe i šešir markeri */
  scoreHistory: Trip<ScoreHistoryEntry[]>
  lastHand: HandResult | null
}

/** Rezime upravo odigrane ruke (za prikaz / spisak poteza). */
export interface HandResult {
  handNo: number
  declarer: Seat
  contract: Contract
  kontra: KontraLevel
  inviteCaller: Seat | null
  kontraBy: Seat | null
  refeApplied: boolean
  tricksWon: Trip<number>
  passed: boolean
  buleDelta: Trip<number>
  supeDelta: Trip<Trip<number>>
}

// Akcije koje menjaju stanje (jedini ulaz: reduce(state, action))
export type Action =
  | { type: 'PASS'; seat: Seat } // „dalje"
  | { type: 'RAISE'; seat: Seat; level: BidLevel } // diže za korak
  | { type: 'HOLD'; seat: Seat } // „moje" (preuzimanje nivoa)
  | { type: 'IGRA'; seat: Seat; level: BidLevel } // „igra" (bez talona)
  | { type: 'TAKE_TALON'; seat: Seat }
  | { type: 'ACK_TALON'; seat: Seat }
  | { type: 'DISCARD'; seat: Seat; cards: [Card, Card] }
  | { type: 'DECLARE'; seat: Seat; contract: Contract }
  | { type: 'FOLLOW'; seat: Seat; value: boolean }
  | { type: 'INVITE'; seat: Seat } // „idemo zajedno" — pratilac uvlači nepratioca
  | { type: 'KONTRA'; seat: Seat }
  | { type: 'PROCEED'; seat?: Seat } // „može"/„dosta"; seat je opcion zbog starih poziva
  | { type: 'PLAY'; seat: Seat; card: Card }
  | { type: 'RESOLVE_TRICK' }
  | { type: 'FINALIZE_CLAIM' } // primeni forsiran ishod i oboduj ruku
  | { type: 'NEXT_HAND' }

export type Difficulty = 'easy' | 'medium' | 'hard'
