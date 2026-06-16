import type {
  Action,
  BidEntry,
  BidLevel,
  BiddingState,
  Card,
  Config,
  Contract,
  GameState,
  HandResult,
  KontraLevel,
  Ledger,
  Seat,
  TrickState,
  Trip,
} from './types'
import { DEFAULT_CONFIG, SUITS } from './types'
import { buildDeck, sameCard } from './deck'
import { shuffle } from './rng'
import {
  applyHold,
  applyIgra,
  applyPass,
  applyRaise,
  biddingOutcome,
  legalBidOptions,
  newBidding,
  right,
} from './bidding'
import { baseValue, trumpOf } from './contract'
import { legalCards, trickWinner } from './play'
import { scoreHand } from './scoring'

const err = (m: string) => new Error(`[engine] ${m}`)

// ─── Inicijalizacija / deljenje ─────────────────────────────────

function emptyLedger(startingBule: number): Ledger {
  return {
    bule: [startingBule, startingBule, startingBule],
    supe: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    refe: [0, 0, 0],
  }
}

interface DealArgs {
  config: Config
  seed: number
  rngState: number
  ledger: Ledger
  handNo: number
  dealer: Seat
  lastHand: HandResult | null
}

/** Promeša i podeli novu ruku (5-5-5 / 2 talon / 5-5-5 → ovde samo seče promešani špil). */
function dealHand(a: DealArgs): GameState {
  const { result, state } = shuffle(buildDeck(), a.rngState)
  return {
    config: a.config,
    seed: a.seed,
    rngState: state,
    handNo: a.handNo,
    dealer: a.dealer,
    phase: 'bidding',
    hands: [result.slice(0, 10), result.slice(10, 20), result.slice(20, 30)],
    talon: result.slice(30, 32),
    discard: [],
    talonTaken: false,
    bidding: newBidding(a.dealer),
    bidLog: [],
    wonLevel: null,
    wonAsIgra: false,
    declarer: null,
    contract: null,
    following: [false, false, false],
    followToAct: null,
    kontra: 0,
    kontraToAct: null,
    trick: null,
    tricksLog: [],
    tricksWon: [0, 0, 0],
    tricksPlayed: 0,
    ledger: a.ledger,
    lastHand: a.lastHand,
  }
}

export function createGame(config: Config = DEFAULT_CONFIG, seed = 1, dealer: Seat = 0): GameState {
  return dealHand({
    config,
    seed,
    rngState: seed >>> 0,
    ledger: emptyLedger(config.startingBule),
    handNo: 1,
    dealer,
    lastHand: null,
  })
}

// ─── Ko je na potezu / legalne akcije ───────────────────────────

function trickToAct(t: TrickState): Seat {
  if (t.cards.length === 0) return t.leader
  return right(t.cards[t.cards.length - 1].seat)
}

export function currentActor(s: GameState): Seat | null {
  switch (s.phase) {
    case 'bidding':
      return s.bidding ? s.bidding.toAct : null
    case 'talon':
      return s.declarer
    case 'following':
      return s.followToAct
    case 'kontra':
      return s.kontraToAct
    case 'playing':
      if (!s.trick) return null
      // kad su sve 3 karte na stolu, čeka se RESOLVE_TRICK (niko nije na potezu)
      return s.trick.cards.length === 3 ? null : trickToAct(s.trick)
    default:
      return null
  }
}

/** Talon-objave (sa talonom): adut/betl/sans, osnovna vrednost ≥ wonLevel. */
function talonDeclareContracts(wonLevel: BidLevel): Contract[] {
  const all: Contract[] = [
    ...SUITS.map((trump) => ({ kind: 'suit', trump, asGame: false }) as Contract),
    { kind: 'betl', asGame: false },
    { kind: 'sans', asGame: false },
  ]
  return all.filter((c) => baseValue(c) >= wonLevel)
}

/** „Igra" objave (bez talona): adut/betl/sans (igra-betl, igra-sans), osnovna vrednost ≥ wonLevel. */
function igraDeclareContracts(wonLevel: BidLevel): Contract[] {
  const all: Contract[] = [
    ...SUITS.map((trump) => ({ kind: 'suit', trump, asGame: true }) as Contract),
    { kind: 'betl', asGame: true },
    { kind: 'sans', asGame: true },
  ]
  return all.filter((c) => baseValue(c) >= wonLevel)
}

/**
 * Legalne akcije za onoga ko je na potezu. Pokriva licitaciju, pratnju, igru i prijavu.
 * (Bacanje 2 karte u talonu je kombinatorno → UI/AI ga rešavaju posebno, ne lista se ovde.)
 */
export function legalActions(s: GameState): Action[] {
  const seat = currentActor(s)
  switch (s.phase) {
    case 'bidding': {
      if (!s.bidding) return []
      const to = s.bidding.toAct
      return legalBidOptions(s.bidding).map((o): Action => {
        switch (o.type) {
          case 'PASS':
            return { type: 'PASS', seat: to }
          case 'RAISE':
            return { type: 'RAISE', seat: to, level: o.level }
          case 'HOLD':
            return { type: 'HOLD', seat: to }
          case 'IGRA':
            return { type: 'IGRA', seat: to, level: o.level }
        }
      })
    }
    case 'talon': {
      if (seat === null || s.wonLevel === null) return []
      const acts: Action[] = []
      if (s.wonAsIgra) {
        for (const c of igraDeclareContracts(s.wonLevel)) acts.push({ type: 'DECLARE', seat, contract: c })
      } else if (!s.talonTaken) {
        acts.push({ type: 'TAKE_TALON', seat })
      } else if (s.hands[seat].length === 10) {
        for (const c of talonDeclareContracts(s.wonLevel)) acts.push({ type: 'DECLARE', seat, contract: c })
      }
      return acts
    }
    case 'following': {
      if (seat === null) return []
      return [
        { type: 'FOLLOW', seat, value: true },
        { type: 'FOLLOW', seat, value: false },
      ]
    }
    case 'kontra': {
      if (seat === null) return []
      const acts: Action[] = []
      if (s.kontra < 4) acts.push({ type: 'KONTRA', seat })
      acts.push({ type: 'PROCEED' })
      return acts
    }
    case 'playing': {
      if (seat === null || !s.trick || !s.contract) return []
      return legalCards(s.hands[seat], s.trick.cards, trumpOf(s.contract), s.config).map((card) => ({
        type: 'PLAY',
        seat,
        card,
      }))
    }
    case 'handScored':
      return [{ type: 'NEXT_HAND' }]
    default:
      return []
  }
}

// ─── reduce ─────────────────────────────────────────────────────

export function reduce(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'PASS':
    case 'RAISE':
    case 'HOLD':
    case 'IGRA':
      return reduceBidding(s, a)
    case 'TAKE_TALON':
    case 'DISCARD':
    case 'DECLARE':
      return reduceTalon(s, a)
    case 'FOLLOW':
      return reduceFollowing(s, a)
    case 'KONTRA':
      return reduceKontra(s, a)
    case 'PROCEED':
      return reduceProceed(s)
    case 'PLAY':
      return reducePlay(s, a)
    case 'RESOLVE_TRICK':
      return reduceResolveTrick(s)
    case 'NEXT_HAND':
      return reduceNextHand(s)
    default: {
      const _exhaustive: never = a
      throw err(`nepoznata akcija: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

function reduceBidding(
  s: GameState,
  a: Extract<Action, { type: 'PASS' | 'RAISE' | 'HOLD' | 'IGRA' }>,
): GameState {
  if (s.phase !== 'bidding' || !s.bidding) throw err('nije faza licitacije')
  if (a.seat !== s.bidding.toAct) throw err('nije tvoj red za licitaciju')

  const entry: BidEntry =
    a.type === 'PASS'
      ? { seat: a.seat, kind: 'pass' }
      : a.type === 'HOLD'
        ? { seat: a.seat, kind: 'hold', level: s.bidding.level ?? 2 }
        : a.type === 'RAISE'
          ? { seat: a.seat, kind: 'raise', level: a.level }
          : { seat: a.seat, kind: 'igra', level: a.level }
  const bidLog = [...s.bidLog, entry]

  let bidding: BiddingState
  switch (a.type) {
    case 'PASS':
      bidding = applyPass(s.bidding)
      break
    case 'RAISE':
      bidding = applyRaise(s.bidding, a.level)
      break
    case 'HOLD':
      bidding = applyHold(s.bidding)
      break
    case 'IGRA':
      bidding = applyIgra(s.bidding, a.level)
      break
  }

  const outcome = biddingOutcome(bidding)
  if (outcome.status === 'ongoing') return { ...s, bidding, bidLog }
  if (outcome.status === 'won') {
    return {
      ...s,
      bidding: null,
      bidLog,
      phase: 'talon',
      declarer: outcome.declarer,
      wonLevel: outcome.wonLevel,
      wonAsIgra: outcome.igra,
      talonTaken: false,
    }
  }
  // svi "dalje" → refe svima (do maxRefe), rotiraj delioca, novo deljenje
  const refe = s.ledger.refe.map((r) => Math.min(r + 1, s.config.maxRefe)) as Trip<number>
  return dealHand({
    config: s.config,
    seed: s.seed,
    rngState: s.rngState,
    ledger: { ...s.ledger, refe },
    handNo: s.handNo + 1,
    dealer: right(s.dealer),
    lastHand: s.lastHand,
  })
}

function reduceTalon(
  s: GameState,
  a: Extract<Action, { type: 'TAKE_TALON' | 'DISCARD' | 'DECLARE' }>,
): GameState {
  if (s.phase !== 'talon' || s.declarer === null || s.wonLevel === null) throw err('nije faza talona')
  if (a.seat !== s.declarer) throw err('samo nosilac igra talon')

  if (a.type === 'TAKE_TALON') {
    if (s.wonAsIgra) throw err('„igra" se igra bez talona')
    if (s.talonTaken) throw err('talon je već uzet')
    const hands = cloneHands(s.hands)
    hands[s.declarer] = [...hands[s.declarer], ...s.talon]
    return { ...s, hands, talon: [], talonTaken: true }
  }

  if (a.type === 'DISCARD') {
    if (s.wonAsIgra) throw err('„igra" se igra bez talona')
    if (!s.talonTaken) throw err('prvo uzmi talon')
    if (s.hands[s.declarer].length !== 12) throw err('nema šta da se baci')
    const [c1, c2] = a.cards
    if (sameCard(c1, c2)) throw err('dve iste karte')
    const hand = s.hands[s.declarer]
    if (!hasCard(hand, c1) || !hasCard(hand, c2)) throw err('nemaš te karte')
    const hands = cloneHands(s.hands)
    hands[s.declarer] = removeCards(hand, [c1, c2])
    return { ...s, hands, discard: [c1, c2] }
  }

  // DECLARE — objavljena igra mora biti ≥ dobijenog nivoa (po osnovnoj vrednosti)
  const c = a.contract
  if (baseValue(c) < s.wonLevel) throw err('igra je niža od licitacije')
  if (s.wonAsIgra) {
    if (!c.asGame) throw err('mora se objaviti kao „igra"')
  } else {
    if (c.asGame) throw err('talon-igra se ne objavljuje kao „igra"')
    if (!s.talonTaken || s.hands[s.declarer].length !== 10) throw err('prvo uzmi talon i baci 2')
  }
  return enterFollowing({ ...s, contract: c })
}

function enterFollowing(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  if (s.contract.kind === 'betl') {
    // u betlu svi prate
    const following: Trip<boolean> = [true, true, true]
    following[s.declarer] = false
    return enterPlaying({ ...s, following, followToAct: null, kontra: 0 })
  }
  return {
    ...s,
    phase: 'following',
    following: [false, false, false],
    followToAct: right(s.declarer),
    kontra: 0,
  }
}

function reduceFollowing(s: GameState, a: Extract<Action, { type: 'FOLLOW' }>): GameState {
  if (s.phase !== 'following' || s.followToAct === null || s.declarer === null) throw err('nije faza pratnje')
  if (a.seat !== s.followToAct) throw err('nije tvoj red za izjašnjavanje')

  const following = [...s.following] as Trip<boolean>
  following[a.seat] = a.value

  const firstDef = right(s.declarer)
  const secondDef = right(firstDef)
  if (a.seat === firstDef) {
    return { ...s, following, followToAct: secondDef }
  }

  // oba se izjasnila → kontra-runda → igra
  return enterKontra({ ...s, following, followToAct: null })
}

function firstDefender(s: GameState): Seat {
  const seats = [0, 1, 2] as Seat[]
  return seats.find((x) => x !== s.declarer && s.following[x]) ?? (seats.find((x) => x !== s.declarer) as Seat)
}

/** Posle pratnje: kontra-runda (ako bar jedan brani), pa igra. */
function enterKontra(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  const defends = ([0, 1, 2] as Seat[]).some((d) => d !== s.declarer && s.following[d])
  if (!defends) return enterPlaying({ ...s, kontra: 0 })

  // obavezna kontra na pik: kontra=1 automatski, nosilac može rekontru
  if (s.config.mandatoryKontraOnPik && s.contract.kind === 'suit' && s.contract.trump === 'pik') {
    const def = firstDefender(s)
    const bidLog: BidEntry[] = [...s.bidLog, { seat: def, kind: 'kontra', kontraLevel: 1 }]
    return { ...s, phase: 'kontra', kontra: 1, kontraToAct: s.declarer, bidLog }
  }
  return { ...s, phase: 'kontra', kontra: 0, kontraToAct: firstDefender(s) }
}

function reduceKontra(s: GameState, a: Extract<Action, { type: 'KONTRA' }>): GameState {
  if (s.phase !== 'kontra' || s.kontraToAct === null || s.declarer === null) throw err('nije faza kontre')
  if (a.seat !== s.kontraToAct) throw err('nije tvoj red za kontru')
  if (s.kontra >= 4) return enterPlaying(s)
  const newKontra = (s.kontra + 1) as KontraLevel
  const bidLog: BidEntry[] = [...s.bidLog, { seat: a.seat, kind: 'kontra', kontraLevel: newKontra }]
  if (newKontra >= 4) return enterPlaying({ ...s, kontra: newKontra, bidLog })
  // nosilac je odgovorio → vraća se odbrani; odbrana → nosilac
  const next = s.kontraToAct === s.declarer ? firstDefender(s) : s.declarer
  return { ...s, kontra: newKontra, kontraToAct: next, bidLog }
}

function reduceProceed(s: GameState): GameState {
  if (s.phase !== 'kontra') throw err('nije faza kontre')
  return enterPlaying(s)
}

function enterPlaying(s: GameState): GameState {
  // pretpostavka: forehand (desno od delioca) vodi prvi štih (vidi CLAUDE.md)
  return { ...s, phase: 'playing', kontraToAct: null, trick: { leader: right(s.dealer), cards: [] } }
}

function reducePlay(s: GameState, a: Extract<Action, { type: 'PLAY' }>): GameState {
  if (s.phase !== 'playing' || !s.trick || !s.contract || s.declarer === null) throw err('nije faza igre')
  if (a.seat !== trickToAct(s.trick)) throw err('nije tvoj red')

  const hand = s.hands[a.seat]
  const trump = trumpOf(s.contract)
  const legal = legalCards(hand, s.trick.cards, trump, s.config)
  if (!legal.some((c) => sameCard(c, a.card))) throw err('nedozvoljen potez')

  const hands = cloneHands(s.hands)
  hands[a.seat] = removeCards(hand, [a.card])
  const cards = [...s.trick.cards, { seat: a.seat, card: a.card }]
  // štih ostaje na stolu dok ga RESOLVE_TRICK ne zatvori (da se vidi poslednja karta)
  return { ...s, hands, trick: { ...s.trick, cards } }
}

function reduceResolveTrick(s: GameState): GameState {
  if (s.phase !== 'playing' || !s.trick || s.trick.cards.length !== 3 || !s.contract) {
    throw err('nema kompletan štih za zatvaranje')
  }
  const winner = trickWinner(s.trick.cards, trumpOf(s.contract)).seat
  const tricksWon = [...s.tricksWon] as Trip<number>
  tricksWon[winner] += 1
  const tricksPlayed = s.tricksPlayed + 1
  const tricksLog = [...s.tricksLog, { cards: s.trick.cards, winner }]

  if (tricksPlayed === 10) {
    return scoreAndAdvance({ ...s, trick: null, tricksWon, tricksPlayed, tricksLog })
  }
  return { ...s, tricksWon, tricksPlayed, tricksLog, trick: { leader: winner, cards: [] } }
}

function scoreAndAdvance(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  const declarer = s.declarer
  const refeApplies = s.ledger.refe[declarer] > 0

  const delta = scoreHand({
    contract: s.contract,
    declarer,
    following: s.following,
    kontra: s.kontra,
    refeApplies,
    tricksWon: s.tricksWon,
  })

  const bule = s.ledger.bule.map((b, i) => b + delta.bule[i]) as Trip<number>
  const supe = s.ledger.supe.map((row, i) => row.map((v, j) => v + delta.supe[i][j])) as Trip<Trip<number>>
  const refe = [...s.ledger.refe] as Trip<number>
  if (refeApplies) refe[declarer] = Math.max(0, refe[declarer] - 1)

  const isBetl = s.contract.kind === 'betl'
  const passed = isBetl ? s.tricksWon[declarer] === 0 : s.tricksWon[declarer] >= 6

  const lastHand: HandResult = {
    handNo: s.handNo,
    declarer,
    contract: s.contract,
    kontra: s.kontra,
    refeApplied: refeApplies,
    tricksWon: s.tricksWon,
    passed,
    buleDelta: delta.bule,
    supeDelta: delta.supe,
  }

  const over = bule[0] + bule[1] + bule[2] <= 0
  return { ...s, ledger: { bule, supe, refe }, lastHand, phase: over ? 'gameOver' : 'handScored' }
}

function reduceNextHand(s: GameState): GameState {
  if (s.phase !== 'handScored') throw err('ruka još nije gotova')
  return dealHand({
    config: s.config,
    seed: s.seed,
    rngState: s.rngState,
    ledger: s.ledger,
    handNo: s.handNo + 1,
    dealer: right(s.dealer),
    lastHand: s.lastHand,
  })
}

// ─── sitni helperi ──────────────────────────────────────────────

function cloneHands(h: Trip<Card[]>): Trip<Card[]> {
  return [[...h[0]], [...h[1]], [...h[2]]]
}
function hasCard(hand: readonly Card[], c: Card): boolean {
  return hand.some((x) => sameCard(x, c))
}
function removeCards(hand: readonly Card[], cards: readonly Card[]): Card[] {
  const out = [...hand]
  for (const c of cards) {
    const i = out.findIndex((x) => sameCard(x, c))
    if (i >= 0) out.splice(i, 1)
  }
  return out
}
