// Lista mojih aktivnih partija (Home preview + ekran Partije) — red po partiji:
// kod, saigrači, status (lobi / ruka N / na potezu si).
import { useNavigate } from 'react-router-dom';
import type { MyGame } from '@/protocol/messages';
import { cn } from '@/lib/utils';

export function myGameStatus(g: MyGame): string {
  if (g.status === 'lobby') return 'čeka igrače';
  const turn = g.currentActor !== null && g.currentActor === g.mySeat ? ' · na potezu si!' : '';
  return `ruka ${g.handNo}${turn}`;
}

export function MyGamesList({ games, limit }: { games: MyGame[]; limit?: number }) {
  const navigate = useNavigate();
  const shown = limit ? games.slice(0, limit) : games;

  return (
    <div className="space-y-1.5">
      {shown.map((g) => {
        const myTurn = g.currentActor !== null && g.currentActor === g.mySeat;
        return (
          <button
            key={g.code}
            onClick={() => navigate(`/o/${g.code}`)}
            className="flex w-full items-center justify-between gap-2 border border-black/25 bg-white px-2.5 py-2 text-left font-mono text-sm shadow-[1px_2px_0_#4d1008] active:translate-y-0.5"
          >
            <span className="min-w-0 truncate font-bold">
              {g.code}
              <span className="ml-2 font-normal text-black/55">
                {g.players
                  .filter((p) => p.seat !== g.mySeat)
                  .map((p) => p.displayName)
                  .join(', ')}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 text-[11px] font-bold',
                myTurn ? 'border border-black/30 bg-[#f3de33] px-1.5 py-0.5 text-black' : 'text-[#9f2f2a]',
              )}
            >
              {myGameStatus(g)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
