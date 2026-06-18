import type { BidEntry, Card, Contract, Seat, Suit, Trip } from '@engine'
import { cn } from '@/lib/utils'
import type { GameHistoryHand, GameHistoryRecord } from '@/history/types'
import { SUIT_LABEL, SUIT_SYMBOL } from '@ui/cards'

const LEVEL_SUIT: Record<number, Suit | null> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: null, 7: null }
const LEVEL_LABEL: Record<number, string> = { 2: 'Pik', 3: 'Karo', 4: 'Herc', 5: 'Tref', 6: 'Betl', 7: 'Sans' }
const KONTRA_LABELS = ['', 'kontra', 'rekontra', 'subkontra', 'mortkontra']
const DIFFICULTY_LABEL: Record<GameHistoryRecord['difficulty'], string> = {
  easy: 'Lako',
  medium: 'Srednje',
  hard: 'Teško',
}

export function dateTimeLabel(value: number): string {
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

export function historyContractLabel(contract: Contract): string {
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

export function scoreClass(score: number): string {
  return score < 0 ? 'text-[#0b7f3a]' : score > 0 ? 'text-[#b73531]' : 'text-black'
}

function finalScoreRows(record: GameHistoryRecord) {
  return record.standings.map((standing) => ({
    ...standing,
    bule: record.finalLedger.bule[standing.seat],
    refe: record.finalLedger.refe[standing.seat],
  }))
}

export function GameHistoryHandDetails({
  hand,
  playerNames,
  defaultOpen = false,
  dense = false,
}: {
  hand: GameHistoryHand
  playerNames: Trip<string>
  defaultOpen?: boolean
  dense?: boolean
}) {
  const followers = ([0, 1, 2] as Seat[])
    .filter((seat) => seat !== hand.declarer && hand.following[seat])
    .map((seat) => playerNames[seat])
  const kontra = hand.kontra > 0 ? ` · ${KONTRA_LABELS[hand.kontra]} x${2 ** hand.kontra}` : ''

  return (
    <details className="border border-[#c9c9c9] bg-[#f6f6f2] shadow-[2px_3px_0_#4d1008]" open={defaultOpen}>
      <summary
        className={cn(
          'grid cursor-pointer items-center gap-2 bg-[#ececea] px-3 py-2 font-mono font-bold',
          dense ? 'grid-cols-[34px_1fr_auto] text-[12px]' : 'grid-cols-[52px_1fr_auto] text-sm',
        )}
      >
        <span>#{hand.handNo}</span>
        <span className="min-w-0 truncate text-[#9f2f2a]">
          {playerNames[hand.declarer]} · {historyContractLabel(hand.contract)}
          {kontra}
        </span>
        <span className={hand.passed ? 'text-[#0b7f3a]' : 'text-[#b73531]'}>{hand.passed ? 'prošao' : 'pao'}</span>
      </summary>
      <div className={cn('grid gap-4 p-3 font-mono text-[12px] leading-5', dense ? '' : 'md:grid-cols-[220px_1fr]')}>
        <div>
          <div className="grid grid-cols-[92px_1fr]">
            <span className="font-bold">Delitelj</span>
            <span className="font-bold text-[#9f2f2a]">{playerNames[hand.dealer]}</span>
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
                  <span>{playerNames[entry.seat]}</span>
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
                        <span className="text-black/55">{playerNames[played.seat]}</span>
                        <CardChip card={played.card} />
                      </span>
                    ))}
                  </span>
                  <span className="whitespace-nowrap font-bold text-[#9f2f2a]">{playerNames[trick.winner]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
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

export function GameHistoryDetail({ record }: { record: GameHistoryRecord }) {
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
          <GameHistoryHandDetails key={hand.handNo} hand={hand} playerNames={record.playerNames} />
        ))}
      </section>
    </div>
  )
}
