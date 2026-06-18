import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHistoryStore } from '@state/historyStore'
import type { BidEntry, Card, Contract, Seat, Suit } from '@engine'
import { cn } from '@/lib/utils'
import type { GameHistoryHand, GameHistoryRecord } from '@/history/types'
import { SUIT_LABEL, SUIT_SYMBOL } from '@ui/cards'

const btnBlue =
  'px-4 py-2 border border-black/35 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'
const btnDanger =
  'px-4 py-2 border border-black/35 bg-[#e7d0cb] text-[#7b1712] font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'

const LEVEL_SUIT: Record<number, Suit | null> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: null, 7: null }
const LEVEL_LABEL: Record<number, string> = { 2: 'Pik', 3: 'Karo', 4: 'Herc', 5: 'Tref', 6: 'Betl', 7: 'Sans' }
const KONTRA_LABELS = ['', 'kontra', 'rekontra', 'subkontra', 'mortkontra']
const DIFFICULTY_LABEL: Record<GameHistoryRecord['difficulty'], string> = {
  easy: 'Lako',
  medium: 'Srednje',
  hard: 'Teško',
}

function dateTimeLabel(value: number): string {
  return new Intl.DateTimeFormat('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function durationLabel(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours} h ${String(minutes).padStart(2, '0')} m`
}

function levelLabel(level: number): string {
  const suit = LEVEL_SUIT[level]
  return suit ? `${LEVEL_LABEL[level]} ${SUIT_SYMBOL[suit]}` : LEVEL_LABEL[level]
}

function contractLabel(contract: Contract): string {
  const suffix = contract.asGame ? ' igra' : ''
  if (contract.kind === 'suit') return `${SUIT_LABEL[contract.trump]} ${SUIT_SYMBOL[contract.trump]}${suffix}`
  return `${contract.kind === 'betl' ? 'Betl' : 'Sans'}${suffix}`
}

function bidEntryLabel(entry: BidEntry): string {
  if (entry.kind === 'pass') return 'dalje'
  if (entry.kind === 'hold') return `moje ${levelLabel(entry.level ?? 2)}`
  if (entry.kind === 'igra') return `igra ${levelLabel(entry.level ?? 2)}`
  if (entry.kind === 'invite') return 'zovem trećeg'
  if (entry.kind === 'kontra') return KONTRA_LABELS[entry.kontraLevel ?? 1]
  return levelLabel(entry.level ?? 2)
}

function CardChip({ card }: { card: Card }) {
  const red = card.suit === 'karo' || card.suit === 'herc'
  return (
    <span
      className={cn(
        'inline-grid h-8 w-7 place-items-center border border-black/30 bg-[#fffdf4] font-mono text-[12px] font-bold shadow-[1px_2px_0_#4d1008]',
        red ? 'text-[#d51f17]' : 'text-black',
      )}
      title={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      {card.rank}
      {SUIT_SYMBOL[card.suit]}
    </span>
  )
}

function scoreClass(score: number): string {
  return score < 0 ? 'text-[#0b7f3a]' : score > 0 ? 'text-[#b73531]' : 'text-black'
}

function finalScoreRows(record: GameHistoryRecord) {
  return record.standings.map((standing) => ({
    ...standing,
    bule: record.finalLedger.bule[standing.seat],
    refe: record.finalLedger.refe[standing.seat],
  }))
}

function HandDetails({ hand, record }: { hand: GameHistoryHand; record: GameHistoryRecord }) {
  const followers = ([0, 1, 2] as Seat[])
    .filter((seat) => seat !== hand.declarer && hand.following[seat])
    .map((seat) => record.playerNames[seat])
  const kontra = hand.kontra > 0 ? ` · ${KONTRA_LABELS[hand.kontra]} x${2 ** hand.kontra}` : ''

  return (
    <details className="border border-[#c9c9c9] bg-[#f6f6f2] shadow-[2px_3px_0_#4d1008]">
      <summary className="grid cursor-pointer grid-cols-[52px_1fr_auto] items-center gap-2 bg-[#ececea] px-3 py-2 font-mono text-sm font-bold">
        <span>#{hand.handNo}</span>
        <span className="min-w-0 truncate text-[#9f2f2a]">
          {record.playerNames[hand.declarer]} · {contractLabel(hand.contract)}
          {kontra}
        </span>
        <span className={hand.passed ? 'text-[#0b7f3a]' : 'text-[#b73531]'}>{hand.passed ? 'prošao' : 'pao'}</span>
      </summary>
      <div className="grid gap-4 p-3 font-mono text-[12px] leading-5 md:grid-cols-[220px_1fr]">
        <div>
          <div className="grid grid-cols-[92px_1fr]">
            <span className="font-bold">Delitelj</span>
            <span className="font-bold text-[#9f2f2a]">{record.playerNames[hand.dealer]}</span>
            <span className="font-bold">Prate</span>
            <span className="font-bold text-[#9f2f2a]">{followers.length === 2 ? 'svi' : followers.join(', ') || 'niko'}</span>
            <span className="font-bold">Štihovi</span>
            <span className="font-bold text-[#9f2f2a]">{hand.tricksWon.join(' / ')}</span>
            <span className="font-bold">Bule</span>
            <span className="font-bold text-[#9f2f2a]">{hand.buleDelta.map((v) => (v > 0 ? `+${v}` : String(v))).join(' / ')}</span>
            <span className="font-bold">Refe</span>
            <span className="font-bold text-[#9f2f2a]">{hand.refeApplied ? 'iskorišćen' : '-'}</span>
          </div>
          {hand.bidLog.length > 0 && (
            <div className="mt-3 border-t border-[#d8d2aa] pt-2">
              <div className="mb-1 font-bold">Licitacija</div>
              {hand.bidLog.map((entry, index) => (
                <div key={`${entry.seat}-${index}`} className="grid grid-cols-[1fr_1.2fr]">
                  <span>{record.playerNames[entry.seat]}</span>
                  <span className="text-right font-bold text-[#9f2f2a]">{bidEntryLabel(entry)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1 font-bold">Štihovi</div>
          {hand.tricksLog.length === 0 ? (
            <div className="text-black/45">Ruka je završena forsirano pre upisa svih štihova.</div>
          ) : (
            <div className="grid gap-2">
              {hand.tricksLog.map((trick, index) => (
                <div key={index} className="grid grid-cols-[28px_1fr_auto] items-center gap-2">
                  <span className="text-black/55">{index + 1}.</span>
                  <span className="flex min-w-0 flex-wrap gap-1">
                    {trick.cards.map((played) => (
                      <span key={`${played.seat}-${played.card.suit}-${played.card.rank}`} className="inline-flex items-center gap-1">
                        <span className="text-black/55">{record.playerNames[played.seat]}</span>
                        <CardChip card={played.card} />
                      </span>
                    ))}
                  </span>
                  <span className="whitespace-nowrap font-bold text-[#9f2f2a]">{record.playerNames[trick.winner]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}

function EmptyHistory() {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-[calc(100dvh-34px)] place-items-center px-4 py-8">
      <div className="w-full max-w-[420px] border border-[#c9c9c9] bg-[#f6f6f2] p-4 text-center font-mono shadow-[4px_5px_0_#4d1008]">
        <h1 className="mb-2 text-xl font-bold">Istorija je prazna</h1>
        <p className="mb-4 text-sm leading-6 text-black/65">Završene partije protiv kompjutera će se ovde čuvati lokalno.</p>
        <button onClick={() => navigate('/')} className={btnBlue}>
          Početna
        </button>
      </div>
    </div>
  )
}

function GameSummary({ record }: { record: GameHistoryRecord }) {
  return (
    <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
      <div className="grid grid-cols-2 gap-y-1 p-3 text-[12px] leading-5 sm:grid-cols-4">
        <span className="font-bold">Završeno</span>
        <span className="font-bold text-[#9f2f2a]">{dateTimeLabel(record.completedAt)}</span>
        <span className="font-bold">Trajanje</span>
        <span className="font-bold text-[#9f2f2a]">{durationLabel(record.durationMs)}</span>
        <span className="font-bold">Težina</span>
        <span className="font-bold text-[#9f2f2a]">{DIFFICULTY_LABEL[record.difficulty]}</span>
        <span className="font-bold">Ruke</span>
        <span className="font-bold text-[#9f2f2a]">{record.handCount}</span>
      </div>
    </section>
  )
}

function HistoryDetail({ record }: { record: GameHistoryRecord }) {
  return (
    <div className="grid gap-4">
      <GameSummary record={record} />

      <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
        <div className="bg-[#ececea] px-3 py-2 text-sm font-bold">Konačan rezultat</div>
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-[12px] text-black/55">
              <tr>
                <th className="py-1">#</th>
                <th>Igrač</th>
                <th className="text-right">Bule</th>
                <th className="text-right">Refe</th>
                <th className="text-right">Ukupno</th>
              </tr>
            </thead>
            <tbody>
              {finalScoreRows(record).map((row) => (
                <tr key={row.seat} className="border-t border-[#d8d2aa]">
                  <td className="py-1.5">{row.rank}.</td>
                  <td className="font-bold">{row.name}</td>
                  <td className="text-right">{row.bule}</td>
                  <td className="text-right">{row.refe}</td>
                  <td className={cn('text-right font-bold tabular-nums', scoreClass(row.score))}>{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="font-mono text-sm font-bold text-black/70">Tok partije</div>
        {record.hands.map((hand) => (
          <HandDetails key={hand.handNo} hand={hand} record={record} />
        ))}
      </section>
    </div>
  )
}

export default function History() {
  const navigate = useNavigate()
  const params = useParams()
  const records = useHistoryStore((state) => state.records)
  const removeRecord = useHistoryStore((state) => state.removeRecord)
  const clear = useHistoryStore((state) => state.clear)
  const selected = records.find((record) => record.id === params.id) ?? records[0]

  useEffect(() => {
    document.title = 'Istorija - Prefa'
  }, [])

  useEffect(() => {
    if (!params.id && selected) navigate(`/history/${selected.id}`, { replace: true })
    if (params.id && records.length > 0 && !selected) navigate(`/history/${records[0].id}`, { replace: true })
  }, [navigate, params.id, records, selected])

  function deleteSelected() {
    if (!selected) return
    removeRecord(selected.id)
    const next = records.find((record) => record.id !== selected.id)
    navigate(next ? `/history/${next.id}` : '/history', { replace: true })
  }

  return (
    <div className="min-h-full bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <button onClick={() => navigate('/')} className="relative z-10 font-mono text-sm font-bold text-white/95">
          ← Početna
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          Istorija partija
        </div>
      </header>

      {records.length === 0 ? (
        <EmptyHistory />
      ) : (
        <main className="mx-auto grid w-full max-w-[1180px] gap-4 px-3 py-4 lg:grid-cols-[300px_1fr]">
          <aside className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
            <div className="flex items-center justify-between gap-2 bg-[#ececea] px-3 py-2 text-sm font-bold">
              <span>Partije ({records.length})</span>
              <button onClick={clear} className="text-[#9f2f2a]">
                obriši sve
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto lg:max-h-[calc(100dvh-112px)]">
              {records.map((record) => {
                const winner = record.standings[0]
                const active = selected?.id === record.id
                return (
                  <button
                    key={record.id}
                    onClick={() => navigate(`/history/${record.id}`)}
                    className={cn(
                      'grid w-full grid-cols-[1fr_auto] gap-2 border-t border-[#d8d2aa] px-3 py-2 text-left text-[12px] leading-5',
                      active ? 'bg-[#fff2a8]' : 'bg-transparent hover:bg-white/45',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{dateTimeLabel(record.completedAt)}</span>
                      <span className="block truncate text-black/60">
                        {record.handCount} ruka · pobednik {winner.name}
                      </span>
                    </span>
                    <span className={cn('self-center font-bold tabular-nums', scoreClass(winner.score))}>{winner.score}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-mono text-2xl font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008]">
                {selected ? dateTimeLabel(selected.completedAt) : 'Istorija'}
              </h1>
              <div className="flex gap-2">
                <button onClick={() => navigate('/')} className={btnBlue}>
                  Nova partija
                </button>
                <button onClick={deleteSelected} className={btnDanger}>
                  Obriši
                </button>
              </div>
            </div>
            {selected && <HistoryDetail record={selected} />}
          </section>
        </main>
      )}
    </div>
  )
}
