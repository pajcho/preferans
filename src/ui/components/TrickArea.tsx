import { cn } from '@/lib/utils'
import { CardView } from './CardView'
import type { GameState, Seat } from '@engine'

type Slot = 'left' | 'right' | 'bottom'

interface Props {
  trick: GameState['trick']
  seatName: (s: number) => string
  /** istakni pobedničku kartu kad je štih kompletan */
  winner?: Seat
  /** gde na stolu ide karta tog sedišta (levo / desno / dole-sredina) */
  slotOf: (seat: number) => Slot
}

const POS: Record<Slot, string> = {
  left: 'absolute left-0 top-0',
  right: 'absolute right-0 top-0',
  bottom: 'absolute left-1/2 -translate-x-1/2 bottom-0',
}

export function TrickArea({ trick, seatName, winner, slotOf }: Props) {
  if (!trick || trick.cards.length === 0) {
    return <div className="text-white/30 text-sm">— sto —</div>
  }
  return (
    <div className="relative w-[200px] h-[176px]">
      {trick.cards.map((pc) => (
        <div key={pc.seat} className={cn('flex flex-col items-center gap-1', POS[slotOf(pc.seat)])}>
          {/* CSS animacija ulaska karte (lagani pop) — bez extra biblioteke */}
          <div
            className={cn(
              'rounded-lg animate-card-in',
              winner === pc.seat && 'ring-2 ring-amber-300 ring-offset-2 ring-offset-felt',
            )}
          >
            <CardView card={pc.card} size="lg" />
          </div>
          <span className="text-[10px] text-white/60">{seatName(pc.seat)}</span>
        </div>
      ))}
    </div>
  )
}
