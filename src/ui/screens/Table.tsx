import { type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@state/gameStore'
import {
  redactFor,
  currentActor,
  legalActions,
  chooseAction,
  cardId,
  baseValue,
  finalScore,
  sortHand,
  trickWinner,
  trumpOf,
  SUITS,
  activeSeatCount,
} from '@engine'
import type { Action, BidEntry, Card, Contract, GameState, Seat, Suit } from '@engine'
import { cn } from '@/lib/utils'
import { Hand } from '@ui/components/Hand'
import { OpponentSeat } from '@ui/components/OpponentSeat'
import { TrickArea } from '@ui/components/TrickArea'
import { ScoreBox } from '@ui/components/ScoreBox'
import { CardView } from '@ui/components/CardView'
import { ScoreHistoryPanel } from '@ui/components/ScoreHistoryPanel'
import { orderedTrickCards } from '@ui/components/trickLogView'
import { isRedSuit, SUIT_LABEL, SUIT_SYMBOL, LEVEL_LABEL } from '@ui/cards'

const BOT_NAMES = ['Pera', 'Laza', 'Mika']
const btnPrimary =
  'px-4 py-2 rounded-[3px] border border-black/40 bg-[#f7f7f2] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition disabled:opacity-50'
const btnGhost =
  'px-4 py-2 rounded-[3px] border border-black/35 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'
// Jedan red u vertikalnom meniju odluke (licitacija/pratnja/kontra)
const menuRowCls = 'w-[176px] max-w-full py-1 text-[13px] sm:w-[190px] sm:py-1.5 sm:text-sm'

const LEVEL_SUIT: Record<number, Suit | null> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: null, 7: null }
function levelLabel(level: number): string {
  const suit = LEVEL_SUIT[level]
  return suit ? `${LEVEL_LABEL[level]} ${SUIT_SYMBOL[suit]}` : LEVEL_LABEL[level]
}

function SuitMark({ suit }: { suit: Suit }) {
  return (
    <span className={cn('inline-block', isRedSuit(suit) ? 'text-[#e51b10]' : 'text-black')} aria-hidden="true">
      {SUIT_SYMBOL[suit]}
    </span>
  )
}

function ContractButtonLabel({ contract, compact = false }: { contract: Contract; compact?: boolean }) {
  const suffix = contract.asGame && !compact ? ' igra' : ''
  if (contract.kind !== 'suit') return <>{(contract.kind === 'betl' ? 'Betl' : 'Sans') + suffix}</>

  return (
    <span className="inline-flex items-center justify-center gap-1">
      <span>{SUIT_LABEL[contract.trump]}</span>
      <SuitMark suit={contract.trump} />
      {suffix && <span>{suffix}</span>}
    </span>
  )
}

function ActionHint({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex min-h-[48px] w-full items-start justify-center px-2 text-center">
      <div className="max-w-[min(620px,calc(100vw-24px))] border border-[#77735f] bg-[#fffbd2] px-4 py-1.5 text-center font-mono text-sm font-bold leading-6 text-black shadow-[3px_4px_0_#4d1008]">
        {children}
      </div>
    </div>
  )
}

function TrickMarkers({
  count,
  lastWon,
  compact = false,
}: {
  count: number
  lastWon: boolean
  compact?: boolean
}) {
  return Array.from({ length: Math.max(count, 0) }).map((_, i) => (
    <span
      key={i}
      className={cn(
        'block rounded-[2px] border border-white/70 bg-[#153cc2] shadow-[1px_2px_0_#4d1008]',
        'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_5px),linear-gradient(135deg,#214cff,#071e94)]',
        compact ? 'h-[16px] w-[11px]' : 'h-[20px] w-[14px]',
        lastWon && i === count - 1 && 'ring-2 ring-[#f3de33]',
      )}
      title="osvojen štih"
    />
  ))
}

function TableSeatLabel({
  name,
  isTurn,
  isDeclarer,
  tricks,
  lastWon,
  markerSide = 'right',
}: {
  name: string
  isTurn: boolean
  isDeclarer: boolean
  tricks: number
  lastWon: boolean
  markerSide?: 'left' | 'right'
}) {
  const markers = tricks > 0 && (
    <span className="flex shrink-0 items-end gap-0.5" aria-label={`${tricks} osvojenih štihova`}>
      <TrickMarkers count={tricks} lastWon={lastWon} compact />
    </span>
  )

  return (
    <div className="flex min-w-0 items-center gap-1.5 font-mono text-sm leading-none text-[#f3de33] drop-shadow-[1px_1px_0_#4d1008]">
      {markerSide === 'left' && markers}
      {isTurn && <span className="animate-pulse">▾</span>}
      <span className="truncate font-bold">{name}</span>
      {isDeclarer && <span title="nosilac">★</span>}
      {markerSide === 'right' && markers}
    </div>
  )
}

function LogCard({ card }: { card?: Card }) {
  if (!card) return <span className="block h-[40px] w-[28px]" aria-hidden="true" />

  return (
    <span
      className={cn(
        'relative grid h-[40px] w-[28px] place-items-center rounded-[4px] border border-black/30 bg-[#fffdf4] font-mono font-bold leading-none shadow-[2px_3px_0_#4d1008]',
        isRedSuit(card.suit) ? 'text-[#e51b10]' : 'text-black',
      )}
      aria-label={`${card.rank} ${SUIT_LABEL[card.suit]}`}
      title={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      <span className="absolute left-0.5 top-0.5 text-[10px] tracking-tight">{card.rank}</span>
      <span className="text-[18px] leading-none">
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span className="absolute bottom-0.5 right-0.5 rotate-180 text-[10px] tracking-tight">{card.rank}</span>
    </span>
  )
}

function tablePageTitle(game: GameState | null): string {
  if (!game) return 'Prefa'
  switch (game.phase) {
    case 'bidding':
      return 'Licitacija - Prefa'
    case 'talon':
      return 'Talon - Prefa'
    case 'following':
      return 'Pratnja - Prefa'
    case 'kontra':
      return 'Kontra - Prefa'
    case 'playing':
      return 'Igra - Prefa'
    case 'claim':
      return 'Završetak ruke - Prefa'
    case 'handScored':
      return 'Rezultat ruke - Prefa'
    case 'gameOver':
      return 'Kraj partije - Prefa'
  }
}

export default function Table() {
  const game = useGameStore((s) => s.game)
  const gameStartedAt = useGameStore((s) => s.gameStartedAt)
  const humanSeat = useGameStore((s) => s.humanSeat)
  const difficulty = useGameStore((s) => s.difficulty)
  const dispatch = useGameStore((s) => s.dispatch)
  const newGame = useGameStore((s) => s.newGame)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Card[]>([])
  const [scoreHistorySeat, setScoreHistorySeat] = useState<Seat | null>(null)
  const [tricksOpen, setTricksOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // bot-runner: zatvori štih posle pauze, pa odigraj botove, pa pređi na sledeću ruku
  useEffect(() => {
    if (!game || game.phase === 'gameOver') return
    if (game.phase === 'playing' && game.trick && game.trick.cards.length === activeSeatCount(game)) {
      const t = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), 1600)
      return () => clearTimeout(t)
    }
    if (game.phase === 'claim') {
      // forsiran ishod - otkrij karte, prikaži poruku, pa završi ruku
      const t = setTimeout(() => dispatch({ type: 'FINALIZE_CLAIM' }), 3500)
      return () => clearTimeout(t)
    }
    if (game.phase === 'handScored') {
      const t = setTimeout(() => dispatch({ type: 'NEXT_HAND' }), 3400)
      return () => clearTimeout(t)
    }
    const actor = currentActor(game)
    if (actor !== null && actor !== humanSeat) {
      const t = setTimeout(() => dispatch(chooseAction(game, actor, difficulty)), 800)
      return () => clearTimeout(t)
    }
  }, [game, humanSeat, difficulty, dispatch])

  useEffect(() => {
    setSelected([])
  }, [game?.phase, game?.handNo])

  useEffect(() => {
    if (!game || !gameStartedAt || game.phase === 'gameOver') return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [game?.phase, gameStartedAt])

  useEffect(() => {
    document.title = tablePageTitle(game)
  }, [game?.phase])

  if (!game) {
    return (
      <div className="min-h-full grid place-items-center bg-felt text-white p-6">
        <div className="text-center">
          <p className="mb-4 text-white/70">Nema aktivne partije.</p>
          <button onClick={() => navigate('/')} className={btnPrimary}>
            Početna
          </button>
        </div>
      </div>
    )
  }

  const view = redactFor(humanSeat, game)
  const seatName = (s: number) => (s === humanSeat ? 'Ti' : BOT_NAMES[s])
  const leftSeat = ((humanSeat + 2) % 3) as Seat
  const rightSeat = ((humanSeat + 1) % 3) as Seat
  const trickLogSeats: [Seat, Seat, Seat] = [leftSeat, humanSeat, rightSeat]
  const scorePanelSeats = (center: Seat): [Seat, Seat, Seat] => [((center + 2) % 3) as Seat, center, ((center + 1) % 3) as Seat]
  const showBids =
    game.phase === 'bidding' || game.phase === 'talon' || game.phase === 'following' || game.phase === 'kontra'
  const showTricks = game.phase === 'playing' || game.phase === 'handScored' || game.phase === 'claim'
  const useInlineHandStatus = showBids || showTricks
  const slotOf = (seat: number): 'left' | 'right' | 'bottom' =>
    seat === humanSeat ? 'bottom' : seat === leftSeat ? 'left' : 'right'

  // rezultat igrača: [supa vs levi-sused | bule | supa vs desni-sused] + ukupno
  const seatScore = (seat: Seat) => {
    const lg = game.ledger
    const nb: Record<number, [Seat, Seat]> = {
      [humanSeat]: [leftSeat, rightSeat],
      [leftSeat]: [rightSeat, humanSeat],
      [rightSeat]: [humanSeat, leftSeat],
    }
    const [ln, rn] = nb[seat]
    const others = ([0, 1, 2] as Seat[]).filter((o) => o !== seat)
    const supaFor = others.reduce<number>((s, o) => s + lg.supe[seat][o], 0)
    const supaAgainst = others.reduce<number>((s, o) => s + lg.supe[o][seat], 0)
    return {
      supL: lg.supe[seat][ln],
      bule: lg.bule[seat],
      supR: lg.supe[seat][rn],
      total: finalScore(lg.bule[seat], supaFor, supaAgainst),
      refe: lg.refe[seat],
    }
  }

  const isDiscardStep =
    game.phase === 'talon' &&
    game.declarer === humanSeat &&
    game.talonTaken &&
    game.hands[humanSeat].length === 12

  const legalPlayIds = new Set(
    game.phase === 'playing' && view.yourTurn
      ? legalActions(game)
          .filter((a): a is Extract<Action, { type: 'PLAY' }> => a.type === 'PLAY')
          .map((a) => cardId(a.card))
      : [],
  )
  const selectedIds = new Set(selected.map(cardId))
  const myHand = sortHand(view.hand)

  const trickWinnerSeat =
    game.trick && game.trick.cards.length === activeSeatCount(game) && game.contract
      ? trickWinner(game.trick.cards, trumpOf(game.contract)).seat
      : undefined
  const lastTrickWinner = game.tricksLog.length > 0 ? game.tricksLog[game.tricksLog.length - 1].winner : null

  // Sažetak za badge ispod karata: najviša igra igrača + „dalje" ako je pasirao.
  function bidSummary(seat: Seat): string | undefined {
    const entries = game!.bidLog.filter((e) => e.seat === seat)
    if (entries.length === 0) return undefined
    const bids = entries.filter((e) => e.kind !== 'pass')
    const passed = entries.some((e) => e.kind === 'pass')
    const last = bids[bids.length - 1]
    let label = ''
    if (last && last.level != null) {
      if (last.kind === 'igra') label = `igra ${levelLabel(last.level)}`
      else if (last.kind === 'hold') label = `Moj ${levelLabel(last.level)}`
      else label = levelLabel(last.level)
    } else if (last?.kind === 'invite') {
      label = 'zovem'
    }
    if (passed) label = label ? `${label} · dalje` : 'dalje'
    return label || undefined
  }

  function seatTopStatus(seat: Seat): string | undefined {
    if (
      game!.contract &&
      game!.declarer !== seat &&
      (game!.phase === 'playing' || game!.phase === 'claim' || game!.phase === 'handScored')
    ) {
      return game!.following[seat] ? undefined : 'ne prati'
    }
    if (!showBids) return undefined
    if (game!.phase === 'following' && game!.contract && game!.declarer !== null && game!.declarer !== seat) {
      if (game!.following[seat]) return 'prati'
      if (game!.followToAct === seat) return undefined
      const firstDefender = ((game!.declarer + 1) % 3) as Seat
      const defenderOrder: [Seat, Seat] = [firstDefender, ((firstDefender + 1) % 3) as Seat]
      const currentIndex = game!.followToAct !== null ? defenderOrder.indexOf(game!.followToAct) : defenderOrder.length
      const seatIndex = defenderOrder.indexOf(seat)
      return seatIndex >= 0 && seatIndex < currentIndex ? 'ne prati' : undefined
    }
    if (game!.phase === 'kontra' && game!.contract && game!.declarer !== seat) {
      if (game!.following[seat]) return undefined
      return 'ne prati'
    }
    return bidSummary(seat)
  }

  function bidEntryLabel(e: BidEntry): string {
    if (e.kind === 'pass') return 'dalje'
    if (e.kind === 'hold') return `Moj ${levelLabel(e.level ?? 2)}`
    if (e.kind === 'igra') return `igra (${levelLabel(e.level ?? 2)})`
    if (e.kind === 'invite') return 'zovem trećeg'
    if (e.kind === 'kontra') {
      const names = ['', 'kontra', 'rekontra', 'subkontra', 'mortkontra']
      return names[e.kontraLevel ?? 1]
    }
    return levelLabel(e.level ?? 2)
  }

  function onCardClick(c: Card) {
    if (isDiscardStep) {
      const id = cardId(c)
      setSelected((prev) =>
        prev.some((x) => cardId(x) === id)
          ? prev.filter((x) => cardId(x) !== id)
          : prev.length < 2
            ? [...prev, c]
            : prev,
      )
      return
    }
    if (legalPlayIds.has(cardId(c))) dispatch({ type: 'PLAY', seat: humanSeat, card: c })
  }

  function contractLabel(c: Contract): string {
    const g = c.asGame ? ' igra' : ''
    if (c.kind === 'suit') return `${SUIT_LABEL[c.trump]} ${SUIT_SYMBOL[c.trump]}${g}`
    return (c.kind === 'betl' ? 'Betl' : 'Sans') + g
  }

  function contractChoiceLabel(c: Contract): string {
    if (c.kind === 'suit') return `${SUIT_LABEL[c.trump]} ${SUIT_SYMBOL[c.trump]}`
    return c.kind === 'betl' ? 'Betl' : 'Sans'
  }

  function declareOptions(): Contract[] {
    const wl = game!.wonLevel ?? 2
    const opts: Contract[] = [
      ...SUITS.map((trump) => ({ kind: 'suit', trump, asGame: false }) as Contract),
      { kind: 'betl', asGame: false },
      { kind: 'sans', asGame: false },
    ]
    return opts.filter((c) => baseValue(c) >= wl)
  }

  function declareOptionsIgra(): Contract[] {
    const wl = game!.wonLevel ?? 2
    const opts: Contract[] = [
      ...SUITS.map((trump) => ({ kind: 'suit', trump, asGame: true }) as Contract),
      { kind: 'betl', asGame: true },
      { kind: 'sans', asGame: true },
    ]
    return opts.filter((c) => baseValue(c) >= wl)
  }

  function statusLine(): string {
    if (game!.phase === 'gameOver') return 'Kraj partije'
    if (game!.contract) {
      const names = ['', 'Kontra', 'Rekontra', 'Subkontra', 'Mortkontra']
      const k = game!.kontra > 0 ? ` · ${names[game!.kontra]} ×${2 ** game!.kontra}` : ''
      return `Igra: ${contractLabel(game!.contract)}${k}`
    }
    if (game!.phase === 'talon' && game!.declarer !== null && game!.wonLevel !== null) {
      return game!.declarer === humanSeat
        ? `Dobio si licitaciju ${levelLabel(game!.wonLevel)}`
        : `${seatName(game!.declarer)} dobio licitaciju ${levelLabel(game!.wonLevel)}`
    }
    if (game!.phase === 'bidding') return 'Licitacija'
    return ''
  }

  function claimMessage(): string {
    if (!game!.claim) return ''
    if (game!.claim.reason === 'betl') return 'Nema pad - betl prolazi'
    if (game!.claim.reason === 'betl-fail') {
      const w = game!.claim.winner
      return w !== null ? `Betl pao - ${seatName(w)} poneo štih` : 'Betl pao'
    }
    const w = game!.claim.winner
    return w !== null ? `${seatName(w)} nosi sve preostale štihove` : 'Nosi sve'
  }

  function formatGameDuration(): string {
    if (!gameStartedAt) return '-'
    const totalMinutes = Math.max(0, Math.floor((now - gameStartedAt) / 60000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours} h ${String(minutes).padStart(2, '0')} m`
  }

  function renderActionHint(): ReactNode {
    if (game!.phase === 'claim') return claimMessage()
    if (game!.phase === 'handScored') {
      const r = view.lastHand
      return r ? `${seatName(r.declarer)} ${r.passed ? 'prošao' : 'pao'} ${contractLabel(r.contract)}, sledeća ruka...` : 'Sledeća ruka...'
    }
    if (!view.yourTurn) {
      const who = view.toAct !== null ? seatName(view.toAct) : ''
      return who ? `${who} je na potezu...` : undefined
    }
    switch (game!.phase) {
      case 'bidding':
        return 'Tvoj potez - licitiraj'
      case 'following':
        return 'Odluči da li braniš igru'
      case 'kontra':
        return 'Odluči da li kontriraš'
      case 'talon':
        if (game!.wonAsIgra) return 'Igra bez talona - prijavi adut'
        if (!game!.talonTaken) return 'Uzmi talon'
        if (isDiscardStep) return 'Izaberi 2 karte za bacanje (klikni na karte u ruci).'
        return 'Prijavi igru (adut)'
      case 'playing':
        return 'Tvoj potez - odigraj kartu'
      default:
        return undefined
    }
  }

  function renderMobileHandStatus(): ReactNode {
    const hint = renderActionHint()
    const bid = showBids ? bidSummary(humanSeat) : undefined
    if (!hint && !bid) return null

    return (
      <div className="max-w-[calc(100vw-20px)] truncate border border-[#77735f] bg-[#fffbd2] px-3 py-1 text-center font-mono text-[12px] font-bold leading-5 text-black shadow-[2px_3px_0_#4d1008]">
        {hint}
        {hint && bid ? <span className="text-black/45"> · </span> : null}
        {bid ? <span className="text-[#9f2f2a]">{bid}</span> : null}
      </div>
    )
  }

  function renderControls() {
    if (game!.phase === 'handScored' || !view.yourTurn) return null
    switch (game!.phase) {
      case 'bidding': {
        const b = game!.bidding
        const acts = legalActions(game!)
        const pass = acts.find((a) => a.type === 'PASS')
        const hold = acts.find((a) => a.type === 'HOLD')
        const raise = acts.find((a): a is Extract<Action, { type: 'RAISE' }> => a.type === 'RAISE')
        const igras = acts.filter((a): a is Extract<Action, { type: 'IGRA' }> => a.type === 'IGRA')
        // „Boja" = brojčani bid u boji (uzima talon), samo nivoi pik..tref (2..5)
        const boja = raise && raise.level <= 5 ? raise : undefined
        // „Igra" = najniža igra u boji bez talona (2..5); konkretnu boju biraš pri prijavi
        const igraSuit = igras.filter((a) => a.level <= 5).sort((x, y) => x.level - y.level)[0]
        // „Betl"/„Sans" = najavljuju se odmah (bez talona); fallback na brojčani skok ako igra nije ponuđena
        const betl = igras.find((a) => a.level === 6) ?? (raise?.level === 6 ? raise : undefined)
        const sans = igras.find((a) => a.level === 7) ?? (raise?.level === 7 ? raise : undefined)

        const menuBtn = cn(btnPrimary, menuRowCls)

        return (
          <div className="flex w-full flex-col items-center gap-1.5 px-1">
            {pass && (
              <button onClick={() => dispatch(pass)} className={cn(btnGhost, menuRowCls)}>
                Dalje
              </button>
            )}
            {boja && (
              <button onClick={() => dispatch(boja)} className={menuBtn}>
                <span className="inline-flex items-center justify-center gap-1">
                  <span>({boja.level}) {SUIT_LABEL[LEVEL_SUIT[boja.level]!]}</span>
                  <SuitMark suit={LEVEL_SUIT[boja.level]!} />
                </span>
              </button>
            )}
            {igraSuit && (
              <button onClick={() => dispatch(igraSuit)} className={menuBtn}>
                Igra
              </button>
            )}
            {betl && (
              <button onClick={() => dispatch(betl)} className={menuBtn}>
                Betl
              </button>
            )}
            {sans && (
              <button onClick={() => dispatch(sans)} className={menuBtn}>
                Sans
              </button>
            )}
            {hold && (
              <button onClick={() => dispatch(hold)} className={cn(menuBtn, 'bg-amber-500')}>
                Moj {levelLabel(b?.level ?? 2)}
              </button>
            )}
          </div>
        )
      }
      case 'following':
        return (
          <div className="flex w-full flex-col items-center gap-1.5 px-1">
            <button
              onClick={() => dispatch({ type: 'FOLLOW', seat: humanSeat, value: true })}
              className={cn(btnPrimary, menuRowCls)}
            >
              Dođem (branim)
            </button>
            <button
              onClick={() => dispatch({ type: 'FOLLOW', seat: humanSeat, value: false })}
              className={cn(btnGhost, menuRowCls)}
            >
              Ne dođem (puštam)
            </button>
          </div>
        )
      case 'kontra': {
        const KONTRA_NAMES = ['Kontra', 'Rekontra', 'Subkontra', 'Mortkontra']
        return (
          <div className="flex w-full flex-col items-center gap-1.5 px-1">
            {game!.kontra < 4 && (
              <button
                onClick={() => dispatch({ type: 'KONTRA', seat: humanSeat })}
                className={cn(btnPrimary, menuRowCls, 'text-[#cc1810]')}
              >
                {KONTRA_NAMES[game!.kontra]}
              </button>
            )}
            {legalActions(game!).some((a) => a.type === 'INVITE') && (
              <button
                onClick={() => dispatch({ type: 'INVITE', seat: humanSeat })}
                className={cn(btnPrimary, menuRowCls)}
              >
                Zovem trećeg
              </button>
            )}
            <button onClick={() => dispatch({ type: 'PROCEED' })} className={cn(btnGhost, menuRowCls)}>
              {game!.kontra > 0 ? 'Dosta' : 'Bez kontre'}
            </button>
          </div>
        )
      }
      case 'talon': {
        if (game!.wonAsIgra) {
          return (
            <div className="flex flex-col items-center gap-2">
              <div className="grid -translate-x-0.5 grid-cols-[repeat(2,clamp(86px,26vw,104px))] place-content-center justify-center gap-x-3 gap-y-3">
                {declareOptionsIgra().map((c, i) => (
                  <button
                    key={i}
                    onClick={() => dispatch({ type: 'DECLARE', seat: humanSeat, contract: c })}
                    className={cn(
                      btnPrimary,
                      'min-h-10 w-[clamp(86px,26vw,104px)] px-2 py-2 text-sm leading-none sm:text-base',
                    )}
                    aria-label={`Igra ${contractChoiceLabel(c)}`}
                    title={`Igra ${contractChoiceLabel(c)}`}
                  >
                    <ContractButtonLabel contract={c} compact />
                  </button>
                ))}
              </div>
            </div>
          )
        }
        if (!game!.talonTaken) {
          return (
            <div className="flex flex-col items-center gap-5">
              <div className="flex gap-3">
                {view.talon.map((c) => (
                  <CardView key={cardId(c)} card={c} size="xl" framed />
                ))}
              </div>
              <button onClick={() => dispatch({ type: 'TAKE_TALON', seat: humanSeat })} className={cn(btnPrimary, 'mt-1')}>
                Uzmi talon
              </button>
            </div>
          )
        }
        if (isDiscardStep) {
          return (
            <div className="flex flex-col items-center">
              <button
                disabled={selected.length !== 2}
                onClick={() => {
                  if (selected.length === 2) {
                    dispatch({ type: 'DISCARD', seat: humanSeat, cards: [selected[0], selected[1]] })
                    setSelected([])
                  }
                }}
                className={btnPrimary}
              >
                Izbaci 2 ({selected.length}/2)
              </button>
            </div>
          )
        }
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2 flex-wrap justify-center">
              {declareOptions().map((c, i) => (
                <button key={i} onClick={() => dispatch({ type: 'DECLARE', seat: humanSeat, contract: c })} className={btnPrimary}>
                  <ContractButtonLabel contract={c} />
                </button>
              ))}
            </div>
          </div>
        )
      }
      case 'playing':
        return null
      default:
        return null
    }
  }

  function renderBidLogCompact() {
    const entries = game!.bidLog.slice(-9)
    return (
      <div className="border border-[#c9c9c9] bg-[#f6f6f2] text-black shadow-[2px_3px_0_#4d1008]">
        <div className="grid grid-cols-[1fr_1.2fr] bg-[#ececea] text-[12px] font-bold">
          <span className="px-2 py-1">Igrač</span>
          <span className="px-2 py-1 text-[#a63630]">Licitacija</span>
        </div>
        <div className="min-h-[110px] max-h-[170px] overflow-hidden px-2 py-1 font-mono text-[12px] leading-5">
          {entries.length === 0 ? (
            <div className="text-black/45">-</div>
          ) : (
            entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_1.2fr] gap-2">
                <span>{seatName(e.seat)}</span>
                <span className="font-bold text-[#9f2f2a]">{bidEntryLabel(e)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  function renderHandInfo() {
    const followerSeats = ([0, 1, 2] as Seat[]).filter((s) => s !== game!.declarer && game!.following[s])
    const followers = followerSeats.map(seatName).join(', ')
    const remainingBule = Math.max(0, game!.ledger.bule[0] + game!.ledger.bule[1] + game!.ledger.bule[2])
    const rows = [
      ['Odigravač', game!.declarer !== null ? seatName(game!.declarer) : '-'],
      ['Kontrakt', game!.contract ? contractLabel(game!.contract) : '-'],
      ['Prate', followerSeats.length === 2 ? 'svi' : followers || (game!.contract ? 'niko' : '-')],
      ['Vrednost', game!.contract ? String(baseValue(game!.contract) + (game!.contract.asGame ? 1 : 0)) : '-'],
      ['Delitelj', seatName(game!.dealer)],
      ['Do kraja', `${remainingBule} (${remainingBule * 10})`],
      ['Vreme igre', formatGameDuration()],
    ]
    return (
      <div className="font-mono text-[12px] leading-5 text-black">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[92px_1fr]">
            <span className="font-bold">{k}</span>
            <span className="font-bold text-[#9f2f2a]">{v}</span>
          </div>
        ))}
      </div>
    )
  }

  function renderCenterPanel() {
    const shouldShowTrick = game!.phase === 'playing' || game!.phase === 'claim' || !!game!.trick?.cards.length
    return (
      <div className="relative mx-auto flex h-[clamp(206px,35vh,292px)] w-full min-w-[260px] flex-col items-center justify-center overflow-hidden border border-[#00572d] bg-[#087f45] shadow-[5px_6px_0_#4d1008] sm:h-[clamp(238px,37vh,320px)] lg:max-w-[920px]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_42px),linear-gradient(rgba(255,255,255,0.06)_0_1px,transparent_1px_42px)] opacity-30" />
        <div className="absolute left-3 top-2 z-20 max-w-[36%] sm:left-5">
          <TableSeatLabel
            name={seatName(leftSeat)}
            isTurn={view.toAct === leftSeat}
            isDeclarer={game!.declarer === leftSeat}
            tricks={showTricks ? game!.tricksWon[leftSeat] : 0}
            lastWon={lastTrickWinner === leftSeat}
          />
        </div>
        <div className="absolute right-3 top-2 z-20 flex max-w-[36%] justify-end sm:right-5">
          <TableSeatLabel
            name={seatName(rightSeat)}
            isTurn={view.toAct === rightSeat}
            isDeclarer={game!.declarer === rightSeat}
            tricks={showTricks ? game!.tricksWon[rightSeat] : 0}
            lastWon={lastTrickWinner === rightSeat}
            markerSide="left"
          />
        </div>
        <div className="absolute bottom-2 left-1/2 z-20 max-w-[46%] -translate-x-1/2">
          <TableSeatLabel
            name={seatName(humanSeat)}
            isTurn={view.toAct === humanSeat}
            isDeclarer={game!.declarer === humanSeat}
            tricks={showTricks ? game!.tricksWon[humanSeat] : 0}
            lastWon={lastTrickWinner === humanSeat}
          />
        </div>
        {!shouldShowTrick && game!.phase === 'following' && game!.contract && (
          <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-2">
            <div className="flex max-w-[calc(100%-12px)] flex-col items-center gap-0.5 border border-[#77735f] bg-[#fffbd2] px-3 py-1.5 text-center shadow-[3px_4px_0_#4d1008]">
              <span className="font-mono text-[10px] font-bold uppercase leading-tight tracking-wide text-black/55">
                Braniš protiv{game!.declarer !== null ? `: ${seatName(game!.declarer)}` : ''}
              </span>
              <span className="font-mono text-lg font-bold leading-none text-black">
                <ContractButtonLabel contract={game!.contract} />
              </span>
            </div>
          </div>
        )}
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-3">
          {shouldShowTrick ? (
            <TrickArea trick={game!.trick} winner={trickWinnerSeat} slotOf={slotOf} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">{renderControls()}</div>
          )}
        </div>
      </div>
    )
  }

  function renderTrickLogCards(cards: { seat: Seat; card: Card }[]) {
    return (
      <div className="grid w-[92px] grid-cols-3 gap-1">
        {orderedTrickCards(cards, trickLogSeats).map((card, index) => (
          <LogCard key={trickLogSeats[index]} card={card} />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-full overflow-hidden bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] shrink-0 items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <button onClick={() => navigate('/')} className="relative z-10 font-mono text-sm font-bold text-white/95">
          ← Izađi
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          {statusLine() || `Prefa · ruka ${game.handNo}`}
        </div>
        <div className="relative z-10 ml-auto flex gap-2 text-sm lg:hidden">
          <button onClick={() => setTricksOpen(true)} aria-label="Potezi" title="Potezi" className="grid h-7 w-8 place-items-center rounded-[2px] bg-white/15 font-mono text-lg font-bold text-white/95">
            ☰
          </button>
          <button onClick={() => setScoreHistorySeat(humanSeat)} aria-label="Bula" title="Bula" className="grid h-7 w-8 place-items-center rounded-[2px] bg-white/15 font-mono text-lg font-bold text-white/95">
            ▦
          </button>
        </div>
      </header>

      <main className="relative mx-auto flex h-[calc(100dvh-34px)] w-full max-w-[1560px] flex-col justify-start gap-2 overflow-hidden px-2 pb-2 lg:gap-1 lg:px-4">
        <aside className="absolute bottom-4 left-3 z-10 hidden w-[245px] flex-col gap-2 lg:flex">
          {renderBidLogCompact()}
          {renderHandInfo()}
        </aside>

        <aside className="absolute bottom-4 right-3 z-10 hidden w-[280px] lg:block">
          <ScoreHistoryPanel
            history={game.scoreHistory}
            ledger={game.ledger}
            seats={[leftSeat, humanSeat, rightSeat]}
            seatName={seatName}
          />
        </aside>

        <section className="grid grid-cols-2 items-start gap-2 pt-3 lg:grid-cols-[minmax(300px,1fr)_minmax(220px,270px)_minmax(300px,1fr)] lg:px-2 xl:px-[42px] min-[1301px]:grid-cols-[minmax(360px,1fr)_minmax(230px,300px)_minmax(360px,1fr)] min-[1301px]:px-[62px] 2xl:px-[86px]">
          <div className="flex justify-start lg:col-start-1 lg:row-start-1">
            <OpponentSeat
              name={seatName(leftSeat)}
              cardCount={view.handCounts[leftSeat]}
              tricks={game.tricksWon[leftSeat]}
              isTurn={view.toAct === leftSeat}
              isDeclarer={game.declarer === leftSeat}
              topStatus={seatTopStatus(leftSeat)}
              showTricks={false}
              score={seatScore(leftSeat)}
              onScoreOpen={() => setScoreHistorySeat(leftSeat)}
              revealCards={game.phase === 'claim' ? game.hands[leftSeat] : undefined}
              lastTrickWinner={lastTrickWinner === leftSeat}
              showName={false}
            />
          </div>
          <div className="col-span-2 row-start-2 mt-1 flex w-full justify-center lg:col-span-3 lg:col-start-1 lg:row-start-2 lg:mt-1">
            {renderCenterPanel()}
          </div>
          <div className="flex justify-end lg:col-start-3 lg:row-start-1">
            <OpponentSeat
              name={seatName(rightSeat)}
              cardCount={view.handCounts[rightSeat]}
              tricks={game.tricksWon[rightSeat]}
              isTurn={view.toAct === rightSeat}
              isDeclarer={game.declarer === rightSeat}
              topStatus={seatTopStatus(rightSeat)}
              showTricks={false}
              score={seatScore(rightSeat)}
              onScoreOpen={() => setScoreHistorySeat(rightSeat)}
              revealCards={game.phase === 'claim' ? game.hands[rightSeat] : undefined}
              lastTrickWinner={lastTrickWinner === rightSeat}
              showName={false}
            />
          </div>
        </section>

        <section className={cn('relative z-20 flex flex-col items-center pb-1 lg:-mt-2', useInlineHandStatus ? 'pt-2 lg:pt-[62px]' : 'pt-[62px]')}>
          <div className={useInlineHandStatus ? 'hidden lg:block' : undefined}>
            <ActionHint>{renderActionHint()}</ActionHint>
          </div>
          <div className="mb-1 flex h-6 items-end gap-1">
            {useInlineHandStatus && <div className="lg:hidden">{renderMobileHandStatus()}</div>}
          </div>
          <Hand
            cards={myHand}
            legalIds={game.phase === 'playing' && view.yourTurn ? legalPlayIds : undefined}
            selectedIds={selectedIds}
            interactive={view.yourTurn || isDiscardStep}
            onCardClick={onCardClick}
          />
          <div className="mt-1 flex w-full max-w-[280px] flex-col items-center">
            <button
              type="button"
              onClick={() => setScoreHistorySeat(humanSeat)}
              className="w-[190px] cursor-pointer border-0 bg-transparent p-0 text-inherit"
              aria-label={`Rezultat ${seatName(humanSeat)}`}
              title={`Rezultat ${seatName(humanSeat)}`}
            >
              <ScoreBox {...seatScore(humanSeat)} />
            </button>
          </div>
        </section>
      </main>

      {scoreHistorySeat !== null && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4" onClick={() => setScoreHistorySeat(null)}>
          <div className="w-full max-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 border border-[#c9c9c9] bg-[#f6f6f2] px-3 py-2 text-center font-mono text-sm font-bold text-black shadow-[2px_3px_0_#4d1008]">
              Istorija - {seatName(scoreHistorySeat)}
            </div>
            <ScoreHistoryPanel
              history={game.scoreHistory}
              ledger={game.ledger}
              seats={scorePanelSeats(scoreHistorySeat)}
              seatName={seatName}
            />
            <button onClick={() => setScoreHistorySeat(null)} className={cn(btnGhost, 'mt-3 w-full')}>
              Zatvori
            </button>
          </div>
        </div>
      )}

      {tricksOpen && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/60 p-4" onClick={() => setTricksOpen(false)}>
          <div
            className="max-h-[82vh] w-full max-w-[430px] overflow-y-auto border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm text-black shadow-[4px_5px_0_#4d1008]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#ececea] px-3 py-2 font-bold">Potezi</div>
            <div className="space-y-4 p-3">
              {game.bidLog.length > 0 && (
                <section>
                  <div className="mb-1 grid grid-cols-[1fr_1.2fr] bg-[#ececea] px-2 py-1 font-bold">
                    <span>Igrač</span>
                    <span className="text-[#a63630]">Licitacija</span>
                  </div>
                  <div className="space-y-0.5 px-2 leading-6">
                    {game.bidLog
                      .filter((e) => e.kind !== 'kontra')
                      .map((e, i) => (
                        <div key={`b${i}`} className="grid grid-cols-[1fr_1.2fr]">
                          <span>{seatName(e.seat)}</span>
                          <span className="text-right font-bold text-[#9f2f2a]">{bidEntryLabel(e)}</span>
                        </div>
                    ))}
                    {game.declarer !== null && game.contract && (
                      <div className="mt-1 grid grid-cols-[1fr_1.2fr] border-t border-[#d8d2aa] pt-1 font-bold">
                        <span className="w-fit border border-[#d8c65c] bg-[#fff2a8] px-1.5 text-black shadow-[1px_2px_0_#4d1008]">
                          {seatName(game.declarer)} ★ nosilac
                        </span>
                        <span className="text-right text-[#9f2f2a]">{contractLabel(game.contract)}</span>
                      </div>
                    )}
                    {game.bidLog
                      .filter((e) => e.kind === 'kontra')
                      .map((e, i) => (
                        <div key={`k${i}`} className="grid grid-cols-[1fr_1.2fr] font-bold text-[#b73531]">
                          <span>{seatName(e.seat)}</span>
                          <span className="text-right">{bidEntryLabel(e)}</span>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-2 bg-[#ececea] px-2 py-1 font-bold">Štihovi (ruka {game.handNo})</div>
                {game.tricksLog.length === 0 && (!game.trick || game.trick.cards.length === 0) ? (
                  <div className="px-2 py-2 text-black/50">Još nije odigran nijedan štih.</div>
                ) : (
                  <div className="space-y-2 px-2">
                    <div className="grid grid-cols-[28px_92px_1fr] items-center gap-3 text-[11px] font-bold text-black/65">
                      <span />
                      <div className="grid w-[92px] grid-cols-3 gap-1 text-center">
                        {trickLogSeats.map((seat) => (
                          <span key={seat}>{seatName(seat)}</span>
                        ))}
                      </div>
                      <span />
                    </div>
                    {game.tricksLog.map((t, i) => (
                      <div key={i} className="grid grid-cols-[28px_92px_1fr] items-center gap-3">
                        <span className="text-black/55">{i + 1}.</span>
                        {renderTrickLogCards(t.cards)}
                        <span className="justify-self-end whitespace-nowrap text-right text-[12px] font-bold text-[#9f2f2a]">
                          uzeo {seatName(t.winner)}
                        </span>
                      </div>
                    ))}
                    {game.trick && game.trick.cards.length > 0 && (
                      <div className="grid grid-cols-[28px_92px_1fr] items-center gap-3 opacity-90">
                        <span className="text-black/55">{game.tricksLog.length + 1}.</span>
                        {renderTrickLogCards(game.trick.cards)}
                        <span className="justify-self-end whitespace-nowrap text-right text-[12px] font-bold text-[#5f5f5a]">
                          u toku
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
            <div className="px-3 pb-3">
              <button onClick={() => setTricksOpen(false)} className={cn(btnGhost, 'w-full')}>
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}

      {game.phase === 'gameOver' && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center p-6 z-30">
          <div className="w-full max-w-sm bg-card rounded-2xl p-5 text-center">
            <h2 className="text-2xl font-bold mb-3">Kraj partije</h2>
            <table className="w-full text-sm mb-4">
              <tbody>
                {[0, 1, 2]
                  .map((s) => {
                    const others = [0, 1, 2].filter((o) => o !== s)
                    const supaFor = others.reduce((sum, o) => sum + game.ledger.supe[s][o], 0)
                    const supaAgainst = others.reduce((sum, o) => sum + game.ledger.supe[o][s], 0)
                    return { s, score: finalScore(game.ledger.bule[s], supaFor, supaAgainst) }
                  })
                  .sort((a, b) => a.score - b.score)
                  .map((r, i) => (
                    <tr key={r.s} className="border-t border-white/10">
                      <td className="text-left py-1.5">
                        {i + 1}. {seatName(r.s)}
                      </td>
                      <td className={cn('text-right font-mono', r.score < 0 ? 'text-emerald-400' : 'text-destructive')}>
                        {r.score}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="flex gap-2">
              <button onClick={() => newGame({ difficulty })} className={cn(btnPrimary, 'flex-1')}>
                Nova partija
              </button>
              <button onClick={() => navigate('/')} className={cn(btnGhost, 'flex-1')}>
                Početna
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
