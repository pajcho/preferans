import { Fragment } from 'react';
import { invitedSeat, right, type BidEntry, type Card, type Contract, type Seat, type Suit, type Trip } from '@engine';
import { cn } from '@/lib/utils';
import type { GameHistoryHand, GameHistoryRecord, PlayedHistoryHand, RefeHistoryHand } from '@/history/types';
import { SUIT_LABEL, SUIT_SYMBOL } from '@ui/cards';
import { MiniCard } from './MiniCard';
import { trickFlowColumns } from './trickLogView';

const LEVEL_SUIT: Record<number, Suit | null> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: null, 7: null };
const LEVEL_LABEL: Record<number, string> = { 2: 'Pik', 3: 'Karo', 4: 'Herc', 5: 'Tref', 6: 'Betl', 7: 'Sans' };
const KONTRA_LABELS = ['', 'kontra', 'rekontra', 'subkontra', 'mortkontra'];
const HISTORY_SEATS: [Seat, Seat, Seat] = [0, 1, 2];
const HISTORY_TRICK_COUNT = 10;
const DIFFICULTY_LABEL: Record<GameHistoryRecord['difficulty'], string> = {
  easy: 'Lako',
  medium: 'Srednje',
  hard: 'Teško',
};

export function dateTimeLabel(value: number): string {
  return new Intl.DateTimeFormat('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function durationLabel(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} h ${String(minutes).padStart(2, '0')} m`;
}

function levelLabel(level: number): string {
  const suit = LEVEL_SUIT[level];
  return suit ? `${LEVEL_LABEL[level]} ${SUIT_SYMBOL[suit]}` : LEVEL_LABEL[level];
}

export function historyContractLabel(contract: Contract): string {
  const suffix = contract.asGame ? ' igra' : '';
  if (contract.kind === 'suit') return `${SUIT_LABEL[contract.trump]} ${SUIT_SYMBOL[contract.trump]}${suffix}`;
  return `${contract.kind === 'betl' ? 'Betl' : 'Sans'}${suffix}`;
}

function bidEntryLabel(entry: BidEntry): string {
  if (entry.kind === 'pass') return 'dalje';
  if (entry.kind === 'hold') return `moje ${levelLabel(entry.level ?? 2)}`;
  if (entry.kind === 'igra') return `igra ${levelLabel(entry.level ?? 2)}`;
  if (entry.kind === 'invite') return 'zovem trećeg';
  if (entry.kind === 'kontra') return KONTRA_LABELS[entry.kontraLevel ?? 1];
  return levelLabel(entry.level ?? 2);
}

function trickFlowRows(humanSeat: Seat): [Seat, Seat, Seat, Seat, Seat] {
  const rightSeat = right(humanSeat);
  const leftSeat = right(rightSeat);
  return [rightSeat, leftSeat, humanSeat, rightSeat, leftSeat];
}

function HistoryCardsRow({ label, cards, muted = false }: { label: string; cards: Card[]; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[74px_1fr] items-start gap-2">
      <span className={cn('pt-2 font-bold', muted ? 'text-black/55' : 'text-black')}>{label}</span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {cards.length === 0 ? (
          <span className="pt-2 text-black/45">-</span>
        ) : (
          cards.map((card) => <MiniCard key={`${label}-${card.suit}-${card.rank}`} card={card} />)
        )}
      </span>
    </div>
  );
}

function InitialHandsPanel({ hand, playerNames }: { hand: PlayedHistoryHand; playerNames: Trip<string> }) {
  return (
    <section>
      <div className="mb-2 font-bold">Karte</div>
      <div className="grid gap-2">
        {HISTORY_SEATS.map((seat) => (
          <HistoryCardsRow
            key={seat}
            label={playerNames[seat]}
            cards={hand.initialHands[seat]}
            muted={seat !== hand.declarer}
          />
        ))}
        {(hand.talon.length > 0 || hand.discard.length > 0) && (
          <div className="mt-1 grid gap-2 border-t border-[#d8d2aa] pt-2">
            <HistoryCardsRow label="Talon" cards={hand.talon} muted />
            <HistoryCardsRow label="Škart" cards={hand.discard} muted />
          </div>
        )}
      </div>
    </section>
  );
}

function PlayedTricksMatrix({
  hand,
  playerNames,
  humanSeat,
}: {
  hand: PlayedHistoryHand;
  playerNames: Trip<string>;
  humanSeat: Seat;
}) {
  const rowSeats = trickFlowRows(humanSeat);
  const columns = trickFlowColumns(hand.tricksLog, rowSeats, HISTORY_TRICK_COUNT);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-bold">Odigrani štihovi</span>
        <span className="text-[11px] font-bold text-black/50">
          {hand.tricksLog.length}/{HISTORY_TRICK_COUNT}
        </span>
      </div>
      {hand.tricksLog.length === 0 ? (
        <div className="text-black/45">Ruka je završena forsirano pre upisa svih štihova.</div>
      ) : (
        <div className="score-history-scroll overflow-x-auto pb-1">
          {/* bez gap-ova: sticky kolona imena mora da pokrije PUNU visinu redova,
              inače se pri horizontalnom skrolu karte vide kroz procepe ispod imena */}
          <div className="grid w-max min-w-full" style={{ gridTemplateColumns: '88px repeat(10, 36px)' }}>
            <div className="sticky left-0 z-10 bg-[#f6f6f2]" />
            {columns.map((column) => (
              <div key={column.trickNo} className="grid h-6 place-items-center text-sm font-bold text-black/70">
                {column.trickNo}
              </div>
            ))}

            {rowSeats.map((seat, rowIndex) => (
              <Fragment key={`${seat}-${rowIndex}`}>
                <div
                  className={cn(
                    'sticky left-0 z-10 flex h-12 min-w-0 items-center bg-[#f6f6f2] pr-2 font-bold',
                    seat === humanSeat ? 'text-black' : seat === hand.declarer ? 'text-[#9f2f2a]' : 'text-black/75',
                  )}
                  title={playerNames[seat]}
                >
                  <span className="truncate">{playerNames[seat]}</span>
                </div>
                {columns.map((column) => {
                  const card = column.cardsByRow[rowIndex];
                  const playedSeat = column.seatsByRow[rowIndex];
                  const winner = playedSeat !== undefined && column.winner === playedSeat;
                  return (
                    <div
                      key={`${rowIndex}-${column.trickNo}`}
                      className="grid h-12 w-9 place-items-center rounded-[3px]"
                      title={
                        card && playedSeat !== undefined
                          ? `${playerNames[playedSeat]}: ${card.rank}${SUIT_SYMBOL[card.suit]}`
                          : undefined
                      }
                    >
                      <MiniCard card={card} winner={winner} />
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function scoreClass(score: number): string {
  return score < 0 ? 'text-[#0b7f3a]' : score > 0 ? 'text-[#b73531]' : 'text-black';
}

function finalScoreRows(record: GameHistoryRecord) {
  return record.standings.map((standing) => ({
    ...standing,
    bule: record.finalLedger.bule[standing.seat],
    refe: record.finalLedger.refe[standing.seat],
  }));
}

/** Prazna ruka (svi „dalje" / refe): nema nosioca/ugovora/štihova — samo podeljene karte + talon. */
function RefeHandDetails({
  hand,
  playerNames,
  defaultOpen,
  dense,
}: {
  hand: RefeHistoryHand;
  playerNames: Trip<string>;
  defaultOpen: boolean;
  dense: boolean;
}) {
  return (
    <details className="border border-[#c9c9c9] bg-[#f6f6f2] shadow-[2px_3px_0_#4d1008]" open={defaultOpen}>
      <summary
        className={cn(
          'grid cursor-pointer items-center gap-2 bg-[#ececea] px-3 py-2 font-mono font-bold',
          dense ? 'grid-cols-[34px_minmax(0,1fr)_auto] text-[12px]' : 'grid-cols-[52px_minmax(0,1fr)_auto] text-sm',
        )}
      >
        <span>#{hand.handNo}</span>
        <span className="min-w-0 truncate text-[#9f2f2a]">Svi „dalje" — prazna ruka</span>
        <span className={hand.refeWritten ? 'text-[#0b7f3a]' : 'text-black/45'}>
          {hand.refeWritten ? 'refe △' : '—'}
        </span>
      </summary>
      <div className="grid grid-cols-1 gap-2 p-3 font-mono text-[12px] leading-5">
        <div className="mb-1 font-bold">Karte</div>
        {HISTORY_SEATS.map((seat) => (
          <HistoryCardsRow key={seat} label={playerNames[seat]} cards={hand.initialHands[seat]} muted />
        ))}
        <div className="mt-1 grid gap-2 border-t border-[#d8d2aa] pt-2">
          <HistoryCardsRow label="Talon" cards={hand.talon} muted />
        </div>
      </div>
    </details>
  );
}

export function GameHistoryHandDetails({
  hand,
  playerNames,
  humanSeat = 0,
  defaultOpen = false,
  dense = false,
}: {
  hand: GameHistoryHand;
  playerNames: Trip<string>;
  humanSeat?: Seat;
  defaultOpen?: boolean;
  dense?: boolean;
}) {
  if (hand.kind === 'refe') {
    return <RefeHandDetails hand={hand} playerNames={playerNames} defaultOpen={defaultOpen} dense={dense} />;
  }

  // poziv „idemo zajedno": pozvani pratilac je pomoćnik (rekao „ne dođem" pa ga je saigrač uvukao)
  const invited = hand.inviteCaller !== null ? invitedSeat(hand.declarer, hand.inviteCaller) : null;
  const followers = ([0, 1, 2] as Seat[])
    .filter((seat) => seat !== hand.declarer && hand.following[seat])
    .map((seat) => (seat === invited ? `${playerNames[seat]} (pozvan)` : playerNames[seat]));
  const kontra = hand.kontra > 0 ? ` · ${KONTRA_LABELS[hand.kontra]} x${2 ** hand.kontra}` : '';
  const poziv = hand.inviteCaller !== null ? ' · poziv' : '';

  return (
    <details className="border border-[#c9c9c9] bg-[#f6f6f2] shadow-[2px_3px_0_#4d1008]" open={defaultOpen}>
      <summary
        className={cn(
          'grid cursor-pointer items-center gap-2 bg-[#ececea] px-3 py-2 font-mono font-bold',
          dense ? 'grid-cols-[34px_minmax(0,1fr)_auto] text-[12px]' : 'grid-cols-[52px_minmax(0,1fr)_auto] text-sm',
        )}
      >
        <span>#{hand.handNo}</span>
        <span className="min-w-0 truncate text-[#9f2f2a]">
          {playerNames[hand.declarer]} · {historyContractLabel(hand.contract)}
          {kontra}
          {poziv}
        </span>
        <span className={hand.passed ? 'text-[#0b7f3a]' : 'text-[#b73531]'}>{hand.passed ? 'prošao' : 'pao'}</span>
      </summary>
      <div
        className={cn(
          'grid grid-cols-1 gap-4 p-3 font-mono text-[12px] leading-5',
          dense ? '' : 'md:grid-cols-[220px_minmax(0,1fr)]',
        )}
      >
        <div>
          <div className="grid grid-cols-[92px_1fr]">
            <span className="font-bold">Delitelj</span>
            <span className="font-bold text-[#9f2f2a]">{playerNames[hand.dealer]}</span>
            <span className="font-bold">Prate</span>
            <span className="font-bold text-[#9f2f2a]">
              {/* kod poziva oba branioca prate — ne skupljaj u „svi" da se vidi ko je pozvan */}
              {followers.length === 2 && hand.inviteCaller === null ? 'svi' : followers.join(', ') || 'niko'}
            </span>
            {hand.inviteCaller !== null && invited !== null && (
              <>
                <span className="font-bold">Poziv</span>
                <span className="font-bold text-[#9f2f2a]">
                  {playerNames[hand.inviteCaller]} → {playerNames[invited]}{' '}
                  <span className="font-normal text-black/55">(idemo zajedno)</span>
                </span>
              </>
            )}
            <span className="font-bold">Štihovi</span>
            <span className="font-bold text-[#9f2f2a]">{hand.tricksWon.join(' / ')}</span>
            <span className="font-bold">Bule</span>
            <span className="font-bold text-[#9f2f2a]">
              {hand.buleDelta.map((v) => (v > 0 ? `+${v}` : String(v))).join(' / ')}
            </span>
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

        <InitialHandsPanel hand={hand} playerNames={playerNames} />

        <div className={dense ? '' : 'md:col-span-2'}>
          <PlayedTricksMatrix hand={hand} playerNames={playerNames} humanSeat={humanSeat} />
        </div>
      </div>
    </details>
  );
}

function GameSummary({ record }: { record: GameHistoryRecord }) {
  return (
    <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
      <div className="grid grid-cols-2 gap-y-1 p-3 text-[12px] leading-5 sm:grid-cols-4">
        <span className="font-bold">Završeno</span>
        <span className="font-bold text-[#9f2f2a]">{dateTimeLabel(record.completedAt)}</span>
        <span className="font-bold">Trajanje</span>
        <span className="font-bold text-[#9f2f2a]">{durationLabel(record.durationMs)}</span>
        <span className="font-bold">{record.mode === 'online' ? 'Tip' : 'Težina'}</span>
        <span className="font-bold text-[#9f2f2a]">
          {record.mode === 'online' ? 'Online' : DIFFICULTY_LABEL[record.difficulty]}
        </span>
        <span className="font-bold">Ruke</span>
        <span className="font-bold text-[#9f2f2a]">{record.handCount}</span>
      </div>
    </section>
  );
}

export function GameHistoryDetail({ record }: { record: GameHistoryRecord }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <GameSummary record={record} />

      <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
        <div className="bg-[#ececea] px-3 py-2 text-sm font-bold">Konačan rezultat</div>
        <div className="overflow-x-auto p-3">
          <table className="w-full min-w-[300px] text-sm">
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

      <section className="grid grid-cols-1 gap-3">
        <div className="font-mono text-sm font-bold text-black/70">Tok partije</div>
        {record.hands.map((hand) => (
          <GameHistoryHandDetails
            key={hand.handNo}
            hand={hand}
            playerNames={record.playerNames}
            humanSeat={record.humanSeat}
          />
        ))}
      </section>
    </div>
  );
}
