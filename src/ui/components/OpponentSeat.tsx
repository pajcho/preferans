import { cn } from '@/lib/utils'
import { cardId } from '@engine'
import type { Card } from '@engine'
import { CardView } from './CardView'
import { ScoreBox } from './ScoreBox'

interface Props {
  name: string
  cardCount: number
  tricks: number
  isTurn: boolean
  isDeclarer: boolean
  following?: boolean
  /** trenutni iskaz u licitaciji (npr. "Pik ♠" ili "dalje") - ispod karata */
  bid?: string
  /** prikaži broj štihova (tek kad partija krene) */
  showTricks?: boolean
  /** rezultat [leva supa | bule | desna supa] + ukupno + refe */
  score?: { supL: number; bule: number; supR: number; total: number; refe?: number }
  onScoreOpen?: () => void
  /** otkrivene karte (u 'claim' fazi) - prikazuju se licem nagore umesto poleđina */
  revealCards?: Card[]
  lastTrickWinner?: boolean
}

export function OpponentSeat({
  name,
  cardCount,
  tricks,
  isTurn,
  isDeclarer,
  following,
  bid,
  showTricks,
  score,
  onScoreOpen,
  revealCards,
  lastTrickWinner,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 transition w-[min(46vw,470px)] lg:w-[min(34vw,430px)] min-[1301px]:w-[min(46vw,470px)]',
        isTurn && 'brightness-110',
      )}
    >
      <div className="h-6 flex items-end gap-1">
        {showTricks &&
          Array.from({ length: Math.max(tricks, 0) }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'block h-[20px] w-[14px] rounded-[2px] border border-white/70 bg-[#153cc2] shadow-[1px_2px_0_#4d1008]',
                'bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_5px),linear-gradient(135deg,#214cff,#071e94)]',
                lastTrickWinner && i === tricks - 1 && 'ring-2 ring-[#f3de33]',
              )}
              title="osvojen štih"
            />
          ))}
      </div>
      {revealCards ? (
        <div className="flex justify-center max-w-full">
          {revealCards.map((c, i) => (
            <div key={cardId(c)} className={i === 0 ? '' : 'opponent-card-overlap'}>
              <CardView card={c} size="table" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-center max-w-full">
          {Array.from({ length: Math.max(cardCount, 0) }).map((_, i) => (
            <div key={i} className={i === 0 ? '' : 'opponent-card-overlap'}>
              <CardView faceDown size="table" />
            </div>
          ))}
        </div>
      )}
      {score && (
        <button
          type="button"
          onClick={onScoreOpen}
          className="mt-1 w-[150px] cursor-pointer border-0 bg-transparent p-0 text-inherit sm:w-[170px]"
          aria-label={`Rezultat ${name}`}
          title={`Rezultat ${name}`}
        >
          <ScoreBox {...score} />
        </button>
      )}
      <button
        type="button"
        onClick={onScoreOpen}
        className="flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-inherit font-mono"
        aria-label={`Istorija rezultata ${name}`}
        title={`Istorija rezultata ${name}`}
      >
        {isTurn && <span className="text-[#f3de33] animate-pulse">▾</span>}
        <span className="font-bold text-[#f3de33] drop-shadow-[1px_1px_0_#4d1008]">{name}</span>
        {isDeclarer && <span title="nosilac">★</span>}
      </button>
      {bid !== undefined && (
        <div className="min-h-[22px] px-4 py-0.5 bg-[#f7f7f2] text-black font-mono text-sm shadow-[2px_3px_0_#4d1008]">
          {bid}
        </div>
      )}
      {showTricks && following !== undefined && (
        <div className={cn('text-xs font-mono', following ? 'text-black/75' : 'text-black/45')}>
          {following ? 'prati' : 'ne prati'}
        </div>
      )}
    </div>
  )
}
