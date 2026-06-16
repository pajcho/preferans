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
  /** trenutni iskaz u licitaciji (npr. "Pik ♠" ili "dalje") — ispod karata */
  bid?: string
  /** prikaži broj štihova (tek kad partija krene) */
  showTricks?: boolean
  /** rezultat [leva supa | bule | desna supa] + ukupno + refe */
  score?: { supL: number; bule: number; supR: number; total: number; refe?: number }
  /** otkrivene karte (u 'claim' fazi) — prikazuju se licem nagore umesto poleđina */
  revealCards?: Card[]
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
  revealCards,
}: Props) {
  return (
    <div className={cn('flex flex-col items-center gap-1 p-2 rounded-xl transition w-36', isTurn && 'bg-white/10 ring-1 ring-primary')}>
      <div className="flex items-center gap-1 text-sm">
        {isTurn && <span className="animate-pulse">⏳</span>}
        <span className="font-semibold">{name}</span>
        {isDeclarer && (
          <span title="nosilac" className="text-amber-300">
            ★
          </span>
        )}
      </div>
      {revealCards ? (
        <div className="flex flex-wrap justify-center">
          {revealCards.map((c, i) => (
            <div key={cardId(c)} className={i === 0 ? '' : '-ml-4'}>
              <CardView card={c} size="sm" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex">
          {Array.from({ length: Math.max(cardCount, 0) }).map((_, i) => (
            <div key={i} className={i === 0 ? '' : '-ml-5'}>
              <CardView faceDown size="sm" />
            </div>
          ))}
        </div>
      )}
      {score && <ScoreBox {...score} />}
      {bid !== undefined && (
        <div className="text-xs px-2 py-0.5 rounded-full bg-white/15 text-white/90">{bid}</div>
      )}
      {showTricks && (
        <div className="text-xs text-white/70">
          štihovi: {tricks}
          {following ? ' · prati' : ''}
        </div>
      )}
    </div>
  )
}
