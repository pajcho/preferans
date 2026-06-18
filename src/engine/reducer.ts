import type {
  Action,
  BidEntry,
  BidLevel,
  BiddingState,
  Card,
  ClaimInfo,
  Config,
  Contract,
  GameState,
  HandResult,
  KontraLevel,
  Ledger,
  ScoreHistoryEntry,
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
import { forcedOutcome } from './claim'

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

function initialScoreHistory(startingBule: number, handNo = 0): Trip<ScoreHistoryEntry[]> {
  return [
    [{ kind: 'bule', handNo, value: startingBule, delta: 0 }],
    [{ kind: 'bule', handNo, value: startingBule, delta: 0 }],
    [{ kind: 'bule', handNo, value: startingBule, delta: 0 }],
  ]
}

function scoreHistoryFromLedger(ledger: Ledger): Trip<ScoreHistoryEntry[]> {
  return ledger.bule.map((b, seat) => {
    const entries: ScoreHistoryEntry[] = [{ kind: 'bule', handNo: 0, value: b, delta: 0 }]
    for (let i = 0; i < ledger.refe[seat]; i += 1) entries.push({ kind: 'refe', handNo: 0, used: false })
    return entries
  }) as Trip<ScoreHistoryEntry[]>
}

function scoreHistoryOf(s: GameState): Trip<ScoreHistoryEntry[]> {
  return s.scoreHistory ? [[...s.scoreHistory[0]], [...s.scoreHistory[1]], [...s.scoreHistory[2]]] : scoreHistoryFromLedger(s.ledger)
}

function addRefeHistory(
  history: Trip<ScoreHistoryEntry[]>,
  oldRefe: Trip<number>,
  newRefe: Trip<number>,
  handNo: number,
): Trip<ScoreHistoryEntry[]> {
  return history.map((entries, seat) =>
    newRefe[seat] > oldRefe[seat] ? [...entries, { kind: 'refe', handNo, used: false }] : entries,
  ) as Trip<ScoreHistoryEntry[]>
}

function markLatestRefeUsed(
  history: Trip<ScoreHistoryEntry[]>,
  seat: Seat,
  handNo: number,
): Trip<ScoreHistoryEntry[]> {
  const next = history.map((entries) => [...entries]) as Trip<ScoreHistoryEntry[]>
  const entries = next[seat]
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry.kind === 'refe' && !entry.used) {
      entries[i] = { ...entry, used: true }
      return next
    }
  }
  entries.push({ kind: 'refe', handNo, used: true })
  return next
}

function addBuleHistory(
  history: Trip<ScoreHistoryEntry[]>,
  oldBule: Trip<number>,
  newBule: Trip<number>,
  delta: Trip<number>,
  handNo: number,
): Trip<ScoreHistoryEntry[]> {
  return history.map((entries, seat) => {
    if (delta[seat] === 0) return entries
    const next = [...entries]
    if (oldBule[seat] >= 0 && newBule[seat] < 0) next.push({ kind: 'hat', handNo, crossed: false })
    if (oldBule[seat] < 0 && newBule[seat] >= 0) next.push({ kind: 'hat', handNo, crossed: true })
    next.push({ kind: 'bule', handNo, value: newBule[seat], delta: delta[seat] })
    return next
  }) as Trip<ScoreHistoryEntry[]>
}

interface DealArgs {
  config: Config
  seed: number
  rngState: number
  ledger: Ledger
  scoreHistory: Trip<ScoreHistoryEntry[]>
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
    inviteCaller: null,
    followToAct: null,
    kontra: 0,
    kontraBy: null,
    kontraToAct: null,
    kontraPassed: [],
    trick: null,
    tricksLog: [],
    claim: null,
    tricksWon: [0, 0, 0],
    tricksPlayed: 0,
    ledger: a.ledger,
    scoreHistory: a.scoreHistory,
    lastHand: a.lastHand,
  }
}

export function createGame(config: Config = DEFAULT_CONFIG, seed = 1, dealer: Seat = 0): GameState {
  return dealHand({
    config,
    seed,
    rngState: seed >>> 0,
    ledger: emptyLedger(config.startingBule),
    scoreHistory: initialScoreHistory(config.startingBule),
    handNo: 1,
    dealer,
    lastHand: null,
  })
}

/** TEST/dev: partija sa unapred zadatim rukama (bez mešanja) — za isprobavanje scenarija. */
export function createGameWithHands(
  config: Config,
  dealer: Seat,
  hands: Trip<Card[]>,
  talon: Card[],
): GameState {
  return {
    config,
    seed: 1,
    rngState: 1,
    handNo: 1,
    dealer,
    phase: 'bidding',
    hands: [hands[0].slice(), hands[1].slice(), hands[2].slice()],
    talon: talon.slice(),
    discard: [],
    talonTaken: false,
    bidding: newBidding(dealer),
    bidLog: [],
    wonLevel: null,
    wonAsIgra: false,
    declarer: null,
    contract: null,
    following: [false, false, false],
    inviteCaller: null,
    followToAct: null,
    kontra: 0,
    kontraBy: null,
    kontraToAct: null,
    kontraPassed: [],
    trick: null,
    tricksLog: [],
    claim: null,
    tricksWon: [0, 0, 0],
    tricksPlayed: 0,
    ledger: emptyLedger(config.startingBule),
    scoreHistory: initialScoreHistory(config.startingBule),
    lastHand: null,
  }
}

// ─── Ko je na potezu / legalne akcije ───────────────────────────

export function activeSeats(s: Pick<GameState, 'contract' | 'declarer' | 'following'>): Seat[] {
  if (s.declarer === null || !s.contract) return [0, 1, 2]
  return ([0, 1, 2] as Seat[]).filter((seat) => seat === s.declarer || s.following[seat])
}

export function activeSeatCount(s: Pick<GameState, 'contract' | 'declarer' | 'following'>): number {
  return activeSeats(s).length
}

function isActiveSeat(s: GameState, seat: Seat): boolean {
  return activeSeats(s).includes(seat)
}

function nextActiveSeat(s: GameState, seat: Seat): Seat {
  let next = right(seat)
  for (let i = 0; i < 3; i += 1) {
    if (isActiveSeat(s, next)) return next
    next = right(next)
  }
  return seat
}

function trickToAct(s: GameState, t: TrickState): Seat | null {
  if (t.cards.length >= activeSeatCount(s)) return null
  if (t.cards.length === 0) return isActiveSeat(s, t.leader) ? t.leader : nextActiveSeat(s, t.leader)
  return nextActiveSeat(s, t.cards[t.cards.length - 1].seat)
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
      // kad je štih kompletan, čeka se RESOLVE_TRICK (niko nije na potezu)
      return trickToAct(s, s.trick)
    default:
      return null
  }
}

function defenderOrder(declarer: Seat): [Seat, Seat] {
  const first = right(declarer)
  return [first, right(first)]
}

function activeDefenders(s: Pick<GameState, 'declarer' | 'following'>): Seat[] {
  if (s.declarer === null) return []
  return defenderOrder(s.declarer).filter((seat) => s.following[seat])
}

function inactiveDefender(s: Pick<GameState, 'declarer' | 'following'>): Seat | null {
  if (s.declarer === null) return null
  return defenderOrder(s.declarer).find((seat) => !s.following[seat]) ?? null
}

function canInvite(s: GameState, seat: Seat): boolean {
  return (
    s.phase === 'kontra' &&
    s.declarer !== null &&
    s.contract?.kind !== 'betl' &&
    s.kontra === 0 &&
    s.inviteCaller === null &&
    s.following[seat] &&
    activeDefenders(s).length === 1 &&
    inactiveDefender(s) !== null
  )
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
      if (canInvite(s, seat)) acts.push({ type: 'INVITE', seat })
      if (s.kontra < 4) acts.push({ type: 'KONTRA', seat })
      acts.push({ type: 'PROCEED', seat })
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
    case 'claim':
      return [{ type: 'FINALIZE_CLAIM' }]
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
    case 'INVITE':
      return reduceInvite(s, a)
    case 'KONTRA':
      return reduceKontra(s, a)
    case 'PROCEED':
      return reduceProceed(s, a)
    case 'PLAY':
      return reducePlay(s, a)
    case 'RESOLVE_TRICK':
      return reduceResolveTrick(s)
    case 'FINALIZE_CLAIM':
      return reduceFinalizeClaim(s)
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
  const legal = legalBidOptions(s.bidding).some((o) => {
    if (o.type !== a.type) return false
    if (o.type === 'RAISE' && a.type === 'RAISE') return o.level === a.level
    if (o.type === 'IGRA' && a.type === 'IGRA') return o.level === a.level
    return true
  })
  if (!legal) throw err('nelegalna licitacija')

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
  // svi "dalje" → refe se upisuje SVIMA (+1), osim ako je BILO KOJI igrač u minusu (ispod kape)
  // ili je dostignut maxRefe — tada se ne piše nikom. Rotiraj delioca, novo deljenje.
  const refe = canWriteRefe(s) ? (s.ledger.refe.map((r) => r + 1) as Trip<number>) : s.ledger.refe
  const scoreHistory = addRefeHistory(scoreHistoryOf(s), s.ledger.refe, refe, s.handNo)
  return dealHand({
    config: s.config,
    seed: s.seed,
    rngState: s.rngState,
    ledger: { ...s.ledger, refe },
    scoreHistory,
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
    return enterKontra({ ...s, following, inviteCaller: null, followToAct: null, kontra: 0, kontraBy: null, kontraPassed: [] })
  }
  return {
    ...s,
    phase: 'following',
    following: [false, false, false],
    inviteCaller: null,
    followToAct: right(s.declarer),
    kontra: 0,
    kontraBy: null,
    kontraPassed: [],
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
  const seats = s.declarer !== null ? defenderOrder(s.declarer) : ([0, 1] as [Seat, Seat])
  return seats.find((x) => x !== s.declarer && s.following[x]) ?? (seats.find((x) => x !== s.declarer) as Seat)
}

/** Posle pratnje: kontra-runda (ako bar jedan brani), pa igra. */
function enterKontra(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  const defends = activeDefenders(s).length > 0
  if (!defends) return scoreUncontested({ ...s, kontra: 0, followToAct: null })

  // Obavezna kontra na pik se NE primenjuje automatski — branioci biraju; ako niko ne kontrira,
  // kazna se primenjuje na kraju runde (finishKontra → pikNoKontraPenalty).
  return { ...s, phase: 'kontra', kontra: 0, kontraBy: null, kontraToAct: firstDefender(s), kontraPassed: [] }
}

function allDefendersFollow(s: Pick<GameState, 'declarer' | 'following'>): Trip<boolean> {
  if (s.declarer === null) return [...s.following] as Trip<boolean>
  const following = [...s.following] as Trip<boolean>
  for (const seat of defenderOrder(s.declarer)) following[seat] = true
  following[s.declarer] = false
  return following
}

function kontraCandidates(s: GameState): Seat[] {
  if (s.declarer === null) return []
  if (s.kontra > 0) return defenderOrder(s.declarer)
  return activeDefenders(s)
}

function nextKontraCandidate(s: GameState, justActed: Seat, passed: readonly Seat[]): Seat | null {
  const candidates = kontraCandidates(s)
  const remaining = candidates.filter((seat) => !passed.includes(seat))
  if (remaining.length === 0) return null
  let next = right(justActed)
  for (let i = 0; i < 3; i += 1) {
    if (remaining.includes(next)) return next
    next = right(next)
  }
  return remaining[0]
}

function scoreUncontested(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  const tricksWon: Trip<number> = [0, 0, 0]
  tricksWon[s.declarer] = 10
  return scoreAndAdvance({
    ...s,
    phase: 'playing',
    kontraToAct: null,
    trick: null,
    tricksLog: [],
    tricksWon,
    tricksPlayed: 10,
  })
}

function reduceInvite(s: GameState, a: Extract<Action, { type: 'INVITE' }>): GameState {
  if (s.phase !== 'kontra' || s.kontraToAct === null || s.declarer === null) throw err('nije faza pozivanja')
  if (a.seat !== s.kontraToAct) throw err('nije tvoj red za pozivanje')
  if (!canInvite(s, a.seat)) throw err('ne možeš da zoveš trećeg')
  const invited = inactiveDefender(s)
  if (invited === null) throw err('nema koga da zoveš')
  const following = [...s.following] as Trip<boolean>
  following[invited] = true
  const bidLog: BidEntry[] = [...s.bidLog, { seat: a.seat, kind: 'invite' }]
  return { ...s, following, inviteCaller: a.seat, bidLog }
}

function reduceKontra(s: GameState, a: Extract<Action, { type: 'KONTRA' }>): GameState {
  if (s.phase !== 'kontra' || s.kontraToAct === null || s.declarer === null) throw err('nije faza kontre')
  if (a.seat !== s.kontraToAct) throw err('nije tvoj red za kontru')
  if (s.kontra >= 4) return enterPlaying(s)
  const newKontra = (s.kontra + 1) as KontraLevel
  const defenderAction = a.seat !== s.declarer
  if (defenderAction && !kontraCandidates(s).includes(a.seat)) throw err('nemaš pravo na kontru')
  if (!defenderAction && s.kontra % 2 === 0) throw err('nosilac može da kontrira samo posle kontre')
  const following = defenderAction ? allDefendersFollow(s) : s.following
  const kontraBy = defenderAction ? a.seat : s.kontraBy
  const bidLog: BidEntry[] = [...s.bidLog, { seat: a.seat, kind: 'kontra', kontraLevel: newKontra }]
  if (newKontra >= 4) return enterPlaying({ ...s, following, kontra: newKontra, kontraBy, kontraPassed: [], bidLog })
  const next = defenderAction ? s.declarer : firstDefender({ ...s, following })
  return { ...s, following, kontra: newKontra, kontraBy, kontraToAct: next, kontraPassed: [], bidLog }
}

function reduceProceed(s: GameState, a: Extract<Action, { type: 'PROCEED' }>): GameState {
  if (s.phase !== 'kontra' || s.kontraToAct === null || s.declarer === null) throw err('nije faza kontre')
  const seat = a.seat ?? s.kontraToAct
  if (seat !== s.kontraToAct) throw err('nije tvoj red za kontru')
  if (seat === s.declarer) return finishKontra(s)

  const passed = s.kontraPassed.includes(seat) ? s.kontraPassed : [...s.kontraPassed, seat]
  const next = nextKontraCandidate(s, seat, passed)
  if (next === null) return finishKontra({ ...s, kontraPassed: passed })
  return { ...s, kontraPassed: passed, kontraToAct: next }
}

/** Kraj kontra-runde → igra, osim obaveznog pika bez ijedne kontre (tada kazna). */
function finishKontra(s: GameState): GameState {
  if (
    s.config.mandatoryKontraOnPik &&
    s.declarer !== null &&
    s.contract?.kind === 'suit' &&
    s.contract.trump === 'pik' &&
    s.kontra === 0
  ) {
    return pikNoKontraPenalty(s)
  }
  return enterPlaying(s)
}

/**
 * „Igra pik" a niko ne kontrira (a bar jedan brani): ruka se NE igra.
 *  - ako se nosiocu sme upisati refe (u plusu i nije na maxRefe) → upiše se, pa novo deljenje;
 *  - inače → nosilac automatski prolazi (nosi sve = pik prolaz −B×2), pa bodovanje.
 */
/** Refe se sme upisati samo ako NIKO nije u minusu (ispod kape) i nije dostignut maxRefe. */
function canWriteRefe(s: Pick<GameState, 'ledger' | 'config'>): boolean {
  if (s.ledger.bule.some((b) => b < 0)) return false
  if (s.ledger.refe.some((r) => r >= s.config.maxRefe)) return false
  return true
}

/**
 * „Igra pik" a niko ne kontrira (a bar jedan brani): ruka se NE igra.
 *  - ako se refe sme upisati → upiše se SVIMA (+1), pa novo deljenje;
 *  - inače (neko u minusu / dostignut maxRefe) → nosilac automatski prolazi (nosi sve = pik
 *    prolaz), a taj prolaz se DUPLIRA ako nosilac drži neodigrani refe (i refe se odpisuje).
 */
function pikNoKontraPenalty(s: GameState): GameState {
  if (canWriteRefe(s)) {
    const refe = s.ledger.refe.map((r) => r + 1) as Trip<number>
    const scoreHistory = addRefeHistory(scoreHistoryOf(s), s.ledger.refe, refe, s.handNo)
    return dealHand({
      config: s.config,
      seed: s.seed,
      rngState: s.rngState,
      ledger: { ...s.ledger, refe },
      scoreHistory,
      handNo: s.handNo + 1,
      dealer: right(s.dealer),
      lastHand: s.lastHand,
    })
  }
  return scoreUncontested(s)
}

function enterPlaying(s: GameState): GameState {
  // Forehand (desno od delioca) vodi prvi štih; ako ne prati, preskače se do aktivnog igrača.
  // IZUZETAK — Sans: „igra se kroz vodioca" → vodi pratilac LEVO od nosioca
  // (right(right(declarer)), pa nosilac igra 2.). Ako levi ne dođe → drugi pratilac;
  // nosilac vodi samo ako oba ne dođu. Izvor: preferansklub.com/pravila1.htm.
  let leader: Seat
  if (s.contract?.kind === 'sans' && s.declarer !== null) {
    const left = right(right(s.declarer))
    const other = right(s.declarer)
    leader = isActiveSeat(s, left) ? left : isActiveSeat(s, other) ? other : s.declarer
  } else {
    const fore = right(s.dealer)
    leader = isActiveSeat(s, fore) ? fore : nextActiveSeat(s, fore)
  }
  // auto-završetak trenutno proverava samo tročlane linije (svi aktivni).
  if (s.config.autoFinish && s.declarer !== null && s.contract && activeSeatCount(s) === 3) {
    const claim = forcedOutcome(s.hands, leader, trumpOf(s.contract), s.contract.kind === 'betl', s.declarer)
    if (claim) return { ...s, phase: 'claim', kontraToAct: null, trick: null, claim }
  }
  return { ...s, phase: 'playing', kontraToAct: null, trick: { leader, cards: [] } }
}

function reducePlay(s: GameState, a: Extract<Action, { type: 'PLAY' }>): GameState {
  if (s.phase !== 'playing' || !s.trick || !s.contract || s.declarer === null) throw err('nije faza igre')
  if (!isActiveSeat(s, a.seat)) throw err('igrač ne učestvuje u ovoj igri')
  if (a.seat !== trickToAct(s, s.trick)) throw err('nije tvoj red')

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
  if (s.phase !== 'playing' || !s.trick || s.trick.cards.length !== activeSeatCount(s) || !s.contract) {
    throw err('nema kompletan štih za zatvaranje')
  }
  const winner = trickWinner(s.trick.cards, trumpOf(s.contract)).seat
  const tricksWon = [...s.tricksWon] as Trip<number>
  tricksWon[winner] += 1
  const tricksPlayed = s.tricksPlayed + 1
  const tricksLog = [...s.tricksLog, { cards: s.trick.cards, winner }]

  if (s.declarer !== null && s.contract.kind !== 'betl' && defenderTricksWon(s, tricksWon) >= 5) {
    return scoreAndAdvance({ ...s, trick: null, tricksWon, tricksPlayed, tricksLog })
  }

  if (tricksPlayed === 10) {
    return scoreAndAdvance({ ...s, trick: null, tricksWon, tricksPlayed, tricksLog })
  }

  // betl PAO: čim nosilac ponese štih, ishod je rešen (fiksna kazna) → kraj odmah
  if (s.config.autoFinish && s.declarer !== null && s.contract.kind === 'betl' && winner === s.declarer) {
    const rem = s.hands[winner].length // preostale karte po ruci (nebitno za betl bodovanje)
    const add: Trip<number> = [0, 0, 0]
    add[right(s.declarer)] = rem
    const claim: ClaimInfo = { add, winner: s.declarer, reason: 'betl-fail' }
    return { ...s, tricksWon, tricksPlayed, tricksLog, trick: null, phase: 'claim', claim }
  }

  // auto-završetak: ako je ostatak ruke forsiran (vodeći nosi sve / betl ne pada)
  if (s.config.autoFinish && s.declarer !== null && s.contract && activeSeatCount(s) === 3) {
    const claim = forcedOutcome(
      s.hands,
      winner,
      trumpOf(s.contract),
      s.contract.kind === 'betl',
      s.declarer,
    )
    if (claim) {
      return { ...s, tricksWon, tricksPlayed, tricksLog, trick: null, phase: 'claim', claim }
    }
  }

  return { ...s, tricksWon, tricksPlayed, tricksLog, trick: { leader: winner, cards: [] } }
}

function reduceFinalizeClaim(s: GameState): GameState {
  if (s.phase !== 'claim' || !s.claim) throw err('nema forsiranog ishoda za primenu')
  const tricksWon = [
    s.tricksWon[0] + s.claim.add[0],
    s.tricksWon[1] + s.claim.add[1],
    s.tricksWon[2] + s.claim.add[2],
  ] as Trip<number>
  return scoreAndAdvance({ ...s, tricksWon, tricksPlayed: 10, claim: null })
}

function scoreAndAdvance(s: GameState): GameState {
  if (s.declarer === null || !s.contract) throw err('nema nosioca/ugovora')
  const declarer = s.declarer
  const refeApplies = s.ledger.refe[declarer] > 0

  const delta = scoreHand({
    contract: s.contract,
    declarer,
    following: s.following,
    inviteCaller: s.inviteCaller,
    kontra: s.kontra,
    kontraBy: s.kontraBy,
    refeApplies,
    supaCap5: s.config.supaCap5,
    tricksWon: s.tricksWon,
  })

  const bule = s.ledger.bule.map((b, i) => b + delta.bule[i]) as Trip<number>
  const supe = s.ledger.supe.map((row, i) => row.map((v, j) => v + delta.supe[i][j])) as Trip<Trip<number>>
  const refe = [...s.ledger.refe] as Trip<number>
  let scoreHistory = scoreHistoryOf(s)
  if (refeApplies) scoreHistory = markLatestRefeUsed(scoreHistory, declarer, s.handNo)
  if (refeApplies) refe[declarer] = Math.max(0, refe[declarer] - 1)
  scoreHistory = addBuleHistory(scoreHistory, s.ledger.bule, bule, delta.bule, s.handNo)

  const isBetl = s.contract.kind === 'betl'
  const passed = isBetl ? s.tricksWon[declarer] === 0 : s.tricksWon[declarer] >= 6

  const lastHand: HandResult = {
    handNo: s.handNo,
    declarer,
    contract: s.contract,
    kontra: s.kontra,
    inviteCaller: s.inviteCaller,
    kontraBy: s.kontraBy,
    refeApplied: refeApplies,
    tricksWon: s.tricksWon,
    passed,
    buleDelta: delta.bule,
    supeDelta: delta.supe,
  }

  const over = bule[0] + bule[1] + bule[2] <= 0
  return { ...s, ledger: { bule, supe, refe }, scoreHistory, lastHand, phase: over ? 'gameOver' : 'handScored' }
}

function defenderTricksWon(s: GameState, tricksWon: Trip<number>): number {
  if (s.declarer === null) return 0
  return ([0, 1, 2] as Seat[])
    .filter((seat) => seat !== s.declarer && s.following[seat])
    .reduce<number>((sum, seat) => sum + tricksWon[seat], 0)
}

function reduceNextHand(s: GameState): GameState {
  if (s.phase !== 'handScored') throw err('ruka još nije gotova')
  return dealHand({
    config: s.config,
    seed: s.seed,
    rngState: s.rngState,
    ledger: s.ledger,
    scoreHistory: scoreHistoryOf(s),
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
