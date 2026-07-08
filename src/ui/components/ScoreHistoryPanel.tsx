import type { GameState, ScoreHistoryEntry, Seat } from '@engine';
import { cn } from '@/lib/utils';
import { projectScoreHistory } from './scoreHistoryProjection';
import type { RefeSide, ScoreHistoryDisplayEntry } from './scoreHistoryProjection';

interface Props {
  history?: GameState['scoreHistory'];
  ledger: GameState['ledger'];
  seats: Seat[];
  seatName: (seat: Seat) => string;
}

function fallbackHistory(ledger: GameState['ledger']): GameState['scoreHistory'] {
  return ledger.bule.map((b, seat) => {
    const entries: ScoreHistoryEntry[] = [{ kind: 'bule', handNo: 0, value: b, delta: 0 }];
    for (let i = 0; i < ledger.refe[seat]; i += 1) entries.push({ kind: 'refe', handNo: 0, used: false });
    return entries;
  }) as GameState['scoreHistory'];
}

function RefeIcon({ sides }: { sides: RefeSide[] }) {
  const label = sides.length > 0 ? 'iskorišćen refe' : 'refe';
  const sideMarks: Record<RefeSide, string> = {
    left: 'M5.2 10.1 10.8 13.7',
    right: 'M13.2 13.7 18.8 10.1',
    bottom: 'M12 16.6v6',
  };
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-label={label} data-refe-sides={sides.join(' ')}>
      <path d="M12 3.5 21 20H3Z" fill="#fffdf4" stroke="#111" strokeWidth="2.2" strokeLinejoin="round" />
      {sides.map((side) => (
        <g key={side}>
          <path d={sideMarks[side]} stroke="#fffdf4" strokeWidth="5" strokeLinecap="round" />
          <path d={sideMarks[side]} stroke="#b73531" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

function HatIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 32 24"
      className="h-[20px] w-[28px]"
      aria-label={crossed ? 'izašao ispod šešira' : 'ispod šešira'}
    >
      <path d="M10 14c.3-4.8 1.6-8.4 6-8.4s5.7 3.6 6 8.4" fill="#8f8f20" stroke="#5e6417" strokeWidth="1.6" />
      <path
        d="M5 16.5c3.6-1.7 18.4-1.7 22 0 1.8.8 1.3 3.2-.7 3.4-6.8.7-13.8.7-20.6 0-2-.2-2.5-2.6-.7-3.4Z"
        fill="#a0a331"
        stroke="#5e6417"
        strokeWidth="1.6"
      />
      <path d="M11 13.8h10" stroke="#f5ef9b" strokeWidth="1.5" strokeLinecap="round" />
      {crossed && (
        <>
          <path d="M6 4 26 21" stroke="#c92d24" strokeWidth="3" strokeLinecap="round" />
          <path d="M26 4 6 21" stroke="#c92d24" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function Entry({ entry }: { entry?: ScoreHistoryDisplayEntry }) {
  if (!entry) return <span className="block h-6" />;
  if (entry.kind === 'refe') return <RefeIcon sides={entry.sides} />;
  if (entry.kind === 'hat') return <HatIcon crossed={entry.crossed} />;
  return <span className={cn('font-bold tabular-nums', entry.value < 0 && 'text-[#b73531]')}>{entry.value}</span>;
}

export function ScoreHistoryPanel({ history, ledger, seats, seatName }: Props) {
  const source = history ?? fallbackHistory(ledger);
  const centerEntries = projectScoreHistory(source, seats);
  const rowCount = Math.max(1, centerEntries.length);

  return (
    <div className="border border-[#c9c9c9] bg-[#f6f6f2] text-black shadow-[2px_3px_0_#4d1008] font-mono text-[12px]">
      <div className="grid grid-cols-3 bg-[#ececea] font-bold">
        {seats.map((seat) => (
          <span key={seat} className="px-2 py-1 text-center">
            {seatName(seat)}
          </span>
        ))}
      </div>
      <div className="score-history-scroll max-h-[220px] overflow-y-auto px-1 py-1">
        {Array.from({ length: rowCount }).map((_, row) => (
          <div key={row} className="grid min-h-6 grid-cols-3 items-center text-center leading-6">
            <div className="min-h-6" />
            <div className="flex min-h-6 items-center justify-center">
              <Entry entry={centerEntries[row]} />
            </div>
            <div className="min-h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
