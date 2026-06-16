import { useEffect, useState } from 'react'
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
} from '@engine'
import type { Action, BidEntry, Card, Contract, Seat, Suit } from '@engine'
import { cn } from '@/lib/utils'
import { Hand } from '@ui/components/Hand'
import { OpponentSeat } from '@ui/components/OpponentSeat'
import { TrickArea } from '@ui/components/TrickArea'
import { ScoreSheet } from '@ui/components/ScoreSheet'
import { ScoreBox } from '@ui/components/ScoreBox'
import { CardView } from '@ui/components/CardView'
import { SUIT_LABEL, SUIT_SYMBOL, LEVEL_LABEL } from '@ui/cards'

const BOT_NAMES = ['Pera', 'Laza', 'Mika']
const btnPrimary =
  'px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition disabled:opacity-50'
const btnGhost = 'px-4 py-2 rounded-xl bg-white/10 text-white/90 font-medium active:scale-95 transition'

const LEVEL_SUIT: Record<number, Suit | null> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: null, 7: null }
function levelLabel(level: number): string {
  const suit = LEVEL_SUIT[level]
  return suit ? `${LEVEL_LABEL[level]} ${SUIT_SYMBOL[suit]}` : LEVEL_LABEL[level]
}

export default function Table() {
  const game = useGameStore((s) => s.game)
  const humanSeat = useGameStore((s) => s.humanSeat)
  const difficulty = useGameStore((s) => s.difficulty)
  const dispatch = useGameStore((s) => s.dispatch)
  const newGame = useGameStore((s) => s.newGame)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Card[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tricksOpen, setTricksOpen] = useState(false)

  // bot-runner: zatvori štih posle pauze, pa odigraj botove, pa pređi na sledeću ruku
  useEffect(() => {
    if (!game || game.phase === 'gameOver') return
    if (game.phase === 'playing' && game.trick && game.trick.cards.length === 3) {
      const t = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), 1600)
      return () => clearTimeout(t)
    }
    if (game.phase === 'claim') {
      // forsiran ishod — otkrij karte, prikaži poruku, pa završi ruku
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
  const showBids =
    game.phase === 'bidding' || game.phase === 'talon' || game.phase === 'following' || game.phase === 'kontra'
  const showTricks = game.phase === 'playing' || game.phase === 'handScored' || game.phase === 'claim'
  const slotOf = (seat: number): 'left' | 'right' | 'bottom' =>
    seat === humanSeat ? 'bottom' : seat === leftSeat ? 'left' : 'right'

  // rezultat igrača: [supa vs levi-sused | bule | supa vs desni-sused] + ukupno (iPref raspored)
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
    game.trick && game.trick.cards.length === 3 && game.contract
      ? trickWinner(game.trick.cards, trumpOf(game.contract)).seat
      : undefined

  // Sažetak za badge ispod karata: najviša igra igrača + „dalje" ako je pasirao.
  function bidSummary(seat: Seat): string | undefined {
    const entries = game!.bidLog.filter((e) => e.seat === seat)
    if (entries.length === 0) return undefined
    const bids = entries.filter((e) => e.kind !== 'pass')
    const passed = entries.some((e) => e.kind === 'pass')
    const last = bids[bids.length - 1]
    let label = ''
    if (last && last.level != null) {
      label = last.kind === 'igra' ? `igra ${levelLabel(last.level)}` : levelLabel(last.level)
    }
    if (passed) label = label ? `${label} · dalje` : 'dalje'
    return label || undefined
  }

  function bidEntryLabel(e: BidEntry): string {
    if (e.kind === 'pass') return 'dalje'
    if (e.kind === 'hold') return `mogu (${levelLabel(e.level ?? 2)})`
    if (e.kind === 'igra') return `igra (${levelLabel(e.level ?? 2)})`
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
    if (game!.phase === 'bidding') return 'Licitacija'
    if (game!.phase === 'talon') return 'Talon'
    return ''
  }

  function claimMessage(): string {
    if (!game!.claim) return ''
    if (game!.claim.reason === 'betl') return 'Nema pad — betl prolazi'
    if (game!.claim.reason === 'betl-fail') {
      const w = game!.claim.winner
      return w !== null ? `Betl pao — ${seatName(w)} poneo štih` : 'Betl pao'
    }
    const w = game!.claim.winner
    return w !== null ? `${seatName(w)} nosi sve preostale štihove` : 'Nosi sve'
  }

  function renderControls() {
    if (game!.phase === 'handScored') {
      const r = view.lastHand
      return (
        <div className="text-white/80 text-sm text-center">
          {r ? `${seatName(r.declarer)} ${r.passed ? 'prošao' : 'pao'} ${contractLabel(r.contract)}` : ''} ·
          sledeća ruka…
        </div>
      )
    }
    if (!view.yourTurn) {
      const who = view.toAct !== null ? seatName(view.toAct) : ''
      return <div className="text-white/55 text-sm">{who ? `${who} je na potezu…` : ''}</div>
    }
    switch (game!.phase) {
      case 'bidding': {
        const b = game!.bidding
        const highText =
          b && b.level != null
            ? `${b.igra ? 'Igra ' : ''}${levelLabel(b.level)} — ${seatName(b.holder!)}`
            : 'još niko nije licitirao'
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs text-white/60">
              Najviše: <b className="text-white/90">{highText}</b>
            </div>
            <div className="flex gap-2 flex-wrap justify-center max-w-md">
              {legalActions(game!).map((a, i) => {
                if (a.type === 'PASS')
                  return (
                    <button key={i} onClick={() => dispatch(a)} className={btnGhost}>
                      Dalje
                    </button>
                  )
                if (a.type === 'RAISE')
                  return (
                    <button key={i} onClick={() => dispatch(a)} className={btnPrimary}>
                      {levelLabel(a.level)}
                    </button>
                  )
                if (a.type === 'HOLD')
                  return (
                    <button key={i} onClick={() => dispatch(a)} className={cn(btnPrimary, 'bg-amber-500 text-black')}>
                      Mogu (moja igra)
                    </button>
                  )
                if (a.type === 'IGRA')
                  return (
                    <button key={i} onClick={() => dispatch(a)} className={cn(btnPrimary, 'bg-sky-600')}>
                      Igra (bez talona)
                    </button>
                  )
                return null
              })}
            </div>
            <div className="text-[11px] text-white/40 text-center max-w-xs">
              Redom 2→7. „Mogu" zadržava nivo (imaš prvenstvo). „Igra" = igraš bez talona, jača od istog nivoa.
            </div>
          </div>
        )
      }
      case 'following':
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm text-white/80 text-center">
              {seatName(game!.declarer!)} igra <b>{game!.contract ? contractLabel(game!.contract) : ''}</b> — braniš li?
            </div>
            <div className="flex gap-3">
              <button onClick={() => dispatch({ type: 'FOLLOW', seat: humanSeat, value: true })} className={btnPrimary}>
                Dođem (branim)
              </button>
              <button onClick={() => dispatch({ type: 'FOLLOW', seat: humanSeat, value: false })} className={btnGhost}>
                Ne dođem (puštam)
              </button>
            </div>
          </div>
        )
      case 'kontra': {
        const KONTRA_NAMES = ['Kontra', 'Rekontra', 'Subkontra', 'Mortkontra']
        return (
          <div className="flex flex-col items-center gap-2">
            <div className="text-sm text-white/80 text-center">
              {game!.declarer !== null ? seatName(game!.declarer) : ''} igra{' '}
              <b>{game!.contract ? contractLabel(game!.contract) : ''}</b>
              {game!.kontra > 0 ? ` · ×${2 ** game!.kontra}` : ''} — kontraš?
            </div>
            <div className="flex gap-3">
              {game!.kontra < 4 && (
                <button
                  onClick={() => dispatch({ type: 'KONTRA', seat: humanSeat })}
                  className={cn(btnPrimary, 'bg-red-600')}
                >
                  {KONTRA_NAMES[game!.kontra]}
                </button>
              )}
              <button onClick={() => dispatch({ type: 'PROCEED' })} className={btnGhost}>
                {game!.kontra > 0 ? 'Dosta' : 'Bez kontre'}
              </button>
            </div>
          </div>
        )
      }
      case 'talon': {
        if (game!.wonAsIgra) {
          return (
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-white/60">Igra bez talona — prijavi adut:</div>
              <div className="flex gap-2 flex-wrap justify-center">
                {declareOptionsIgra().map((c, i) => (
                  <button
                    key={i}
                    onClick={() => dispatch({ type: 'DECLARE', seat: humanSeat, contract: c })}
                    className={btnPrimary}
                  >
                    {contractLabel(c)}
                  </button>
                ))}
              </div>
            </div>
          )
        }
        if (!game!.talonTaken) {
          return (
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-white/60">Tvoj talon (2 karte):</div>
              <div className="flex gap-1">
                {view.talon.map((c) => (
                  <CardView key={cardId(c)} card={c} size="md" />
                ))}
              </div>
              <button onClick={() => dispatch({ type: 'TAKE_TALON', seat: humanSeat })} className={btnPrimary}>
                Uzmi talon
              </button>
            </div>
          )
        }
        if (isDiscardStep) {
          return (
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs text-white/60">Izaberi 2 karte za bacanje (klikni na karte u ruci).</div>
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
            <div className="text-xs text-white/60">Prijavi igru (adut):</div>
            <div className="flex gap-2 flex-wrap justify-center">
              {declareOptions().map((c, i) => (
                <button key={i} onClick={() => dispatch({ type: 'DECLARE', seat: humanSeat, contract: c })} className={btnPrimary}>
                  {contractLabel(c)}
                </button>
              ))}
            </div>
          </div>
        )
      }
      case 'playing':
        return <div className="text-primary text-sm font-medium">Tvoj potez — odigraj kartu</div>
      default:
        return null
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-felt text-white">
      <header className="flex items-center justify-between px-3 py-2 text-sm shrink-0">
        <button onClick={() => navigate('/')} className="text-white/70">
          ← Izađi
        </button>
        <div className="text-white/80 font-medium">{statusLine()}</div>
        <div className="flex gap-3">
          <button onClick={() => setTricksOpen(true)} className="text-white/70">
            Potezi
          </button>
          <button onClick={() => setSheetOpen(true)} className="text-white/70">
            Bula
          </button>
        </div>
      </header>

      <div className="flex justify-between items-start px-2 shrink-0">
        <OpponentSeat
          name={seatName(leftSeat)}
          cardCount={view.handCounts[leftSeat]}
          tricks={game.tricksWon[leftSeat]}
          isTurn={view.toAct === leftSeat}
          isDeclarer={game.declarer === leftSeat}
          following={game.phase === 'playing' && game.declarer !== leftSeat ? game.following[leftSeat] : undefined}
          bid={showBids ? bidSummary(leftSeat) : undefined}
          showTricks={showTricks}
          score={seatScore(leftSeat)}
          revealCards={game.phase === 'claim' ? game.hands[leftSeat] : undefined}
        />
        <OpponentSeat
          name={seatName(rightSeat)}
          cardCount={view.handCounts[rightSeat]}
          tricks={game.tricksWon[rightSeat]}
          isTurn={view.toAct === rightSeat}
          isDeclarer={game.declarer === rightSeat}
          following={game.phase === 'playing' && game.declarer !== rightSeat ? game.following[rightSeat] : undefined}
          bid={showBids ? bidSummary(rightSeat) : undefined}
          showTricks={showTricks}
          score={seatScore(rightSeat)}
          revealCards={game.phase === 'claim' ? game.hands[rightSeat] : undefined}
        />
      </div>

      <div className="flex-1 grid place-items-center px-3 min-h-[120px]">
        {game.phase === 'claim' ? (
          <div className="bg-card/95 rounded-2xl px-6 py-4 text-center shadow-xl animate-card-in">
            <div className="text-xl font-bold">{claimMessage()}</div>
            <div className="text-sm text-white/60 mt-1">završavam ruku…</div>
          </div>
        ) : (
          <TrickArea trick={game.trick} seatName={seatName} winner={trickWinnerSeat} slotOf={slotOf} />
        )}
      </div>

      <div className="shrink-0 pb-3">
        <div className="min-h-[4.5rem] flex items-center justify-center px-3">{renderControls()}</div>
        <div className="flex items-center justify-center gap-2 text-xs text-white/60 pb-1">
          <span>
            {seatName(humanSeat)}
            {showTricks ? ` · štihovi: ${game.tricksWon[humanSeat]}` : ''}
          </span>
          {game.declarer === humanSeat && <span className="text-amber-300">★ nosilac</span>}
          {showBids && bidSummary(humanSeat) && (
            <span className="px-2 py-0.5 rounded-full bg-white/15">{bidSummary(humanSeat)}</span>
          )}
        </div>
        <Hand
          cards={myHand}
          legalIds={game.phase === 'playing' && view.yourTurn ? legalPlayIds : undefined}
          selectedIds={selectedIds}
          interactive={view.yourTurn || isDiscardStep}
          onCardClick={onCardClick}
        />
        <div className="flex justify-center pt-2">
          <div className="w-36">
            <ScoreBox {...seatScore(humanSeat)} />
          </div>
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-6 z-20" onClick={() => setSheetOpen(false)}>
          <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <ScoreSheet ledger={game.ledger} seatName={seatName} />
            <button onClick={() => setSheetOpen(false)} className={cn(btnGhost, 'mt-3 w-full')}>
              Zatvori
            </button>
          </div>
        </div>
      )}

      {tricksOpen && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center p-4 z-20" onClick={() => setTricksOpen(false)}>
          <div className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-card rounded-2xl p-4" onClick={(e) => e.stopPropagation()}>
            {game.bidLog.length > 0 && (
              <div className="mb-3">
                <div className="font-semibold mb-1">Licitacija</div>
                <div className="flex flex-col gap-0.5 text-sm">
                  {game.bidLog
                    .filter((e) => e.kind !== 'kontra')
                    .map((e, i) => (
                      <div key={`b${i}`} className="flex justify-between">
                        <span>{seatName(e.seat)}</span>
                        <span className="text-white/70">{bidEntryLabel(e)}</span>
                      </div>
                    ))}
                  {game.declarer !== null && game.contract && (
                    <div className="flex justify-between border-t border-white/10 mt-1 pt-1 text-amber-300">
                      <span>{seatName(game.declarer)} ★ nosilac</span>
                      <span>{contractLabel(game.contract)}</span>
                    </div>
                  )}
                  {game.bidLog
                    .filter((e) => e.kind === 'kontra')
                    .map((e, i) => (
                      <div key={`k${i}`} className="flex justify-between text-red-300 font-medium">
                        <span>{seatName(e.seat)}</span>
                        <span>{bidEntryLabel(e)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
            <div className="font-semibold mb-3">Štihovi (ruka {game.handNo})</div>
            {game.tricksLog.length === 0 && (!game.trick || game.trick.cards.length === 0) ? (
              <div className="text-white/50 text-sm">Još nije odigran nijedan štih.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {game.tricksLog.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-6 text-white/50">{i + 1}.</span>
                    <div className="flex gap-1">
                      {t.cards.map((pc) => (
                        <CardView key={pc.seat} card={pc.card} size="sm" />
                      ))}
                    </div>
                    <span className="text-white/60 text-xs ml-auto">uzeo {seatName(t.winner)}</span>
                  </div>
                ))}
                {game.trick && game.trick.cards.length > 0 && (
                  <div className="flex items-center gap-2 text-sm opacity-70">
                    <span className="w-6 text-white/50">{game.tricksLog.length + 1}.</span>
                    <div className="flex gap-1">
                      {game.trick.cards.map((pc) => (
                        <CardView key={pc.seat} card={pc.card} size="sm" />
                      ))}
                    </div>
                    <span className="text-white/60 text-xs ml-auto">u toku</span>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setTricksOpen(false)} className={cn(btnGhost, 'mt-3 w-full')}>
              Zatvori
            </button>
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
