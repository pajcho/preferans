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
  /** redosled poteza od forehand-a (indeks 0 = najveće prvenstvo) */
  order: [Seat, Seat, Seat]
  toAct: Seat
  /** trenutni nivo (2..7) ili null pre prvog bida */
  level: BidLevel | null
  /** da li je trenutni vodeći bid „igra" (bez talona) */
  igra: boolean
  holder: Seat | null
  passed: Seat[]
  /** ko je već dao pozitivan bid (raise/hold/igra) — gejtuje „igra" na prvi potez */
  acted: Seat[]
}

/** Jedan iskaz u licitaciji (za istoriju/„spisak poteza"). */
export interface BidEntry {
  seat: Seat
  kind: 'pass' | 'raise' | 'hold' | 'igra' | 'kontra'
  level?: BidLevel
  /** za kind==='kontra': 1=kontra, 2=rekontra, 3=subkontra, 4=mortkontra */
  kontraLevel?: KontraLevel
}

export interface TrickState {
  leader: Seat
  cards: PlayedCard[]
}

export interface CompletedTrick {
  cards: PlayedCard[]
  winner: Seat
}

/** Forsiran ishod ruke (auto-završetak): raspodela preostalih štihova + razlog. */
export interface ClaimInfo {
  add: Trip<number>
  winner: Seat | null
  reason: 'claim' | 'betl'
}

export interface Ledger {
  /** srednja kolona (signed; negativno = bolje) po sedištu */
  bule: Trip<number>
  /** supe[from][against] — koliko je `from` upisao protiv `against` */
  supe: Trip<Trip<number>>
  /** neodigrani refe po igraču */
  refe: Trip<number>
}

// ─── Kućna pravila (vidi docs/RULES.md §CONFIG) ───
export interface Config {
  startingBule: number
  maxRefe: number
  mandatoryKontraOnPik: boolean
  mustOvertrump: boolean
  mustHeadSuit: boolean
  /** ograniči supe para na 5 štihova (izvor to ne traži → default false) */
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
  supaCap5: false,
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
  followToAct: Seat | null
  kontra: KontraLevel
  /** ko je na potezu u fazi kontre (null van te faze) */
  kontraToAct: Seat | null
  trick: TrickState | null
  tricksLog: CompletedTrick[]
  /** forsiran ishod (auto-završetak); null osim u fazi 'claim' */
  claim: ClaimInfo | null
  tricksWon: Trip<number>
  tricksPlayed: number
  ledger: Ledger
  lastHand: HandResult | null
}

/** Rezime upravo odigrane ruke (za prikaz / spisak poteza). */
export interface HandResult {
  handNo: number
  declarer: Seat
  contract: Contract
  kontra: KontraLevel
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
  | { type: 'HOLD'; seat: Seat } // „mogu" (prvenstvo, zadrži nivo)
  | { type: 'IGRA'; seat: Seat; level: BidLevel } // „igra" (bez talona)
  | { type: 'TAKE_TALON'; seat: Seat }
  | { type: 'DISCARD'; seat: Seat; cards: [Card, Card] }
  | { type: 'DECLARE'; seat: Seat; contract: Contract }
  | { type: 'FOLLOW'; seat: Seat; value: boolean }
  | { type: 'KONTRA'; seat: Seat }
  | { type: 'PROCEED' } // završi kontra-rundu, kreni igru
  | { type: 'PLAY'; seat: Seat; card: Card }
  | { type: 'RESOLVE_TRICK' }
  | { type: 'FINALIZE_CLAIM' } // primeni forsiran ishod i oboduj ruku
  | { type: 'NEXT_HAND' }

export type Difficulty = 'easy' | 'medium' | 'hard'
