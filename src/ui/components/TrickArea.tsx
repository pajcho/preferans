import { cn } from '@/lib/utils'
import { CardView } from './CardView'
import type { GameState, Seat } from '@engine'

type Slot = 'left' | 'right' | 'bottom'

interface Props {
  trick: GameState['trick']
  /** istakni pobedničku kartu kad je štih kompletan */
  winner?: Seat
  /** gde na stolu ide karta tog sedišta (levo / desno / dole-sredina) */
  slotOf: (seat: number) => Slot
}

const POS: Record<Slot, string> = {
  left: 'absolute left-4 top-12 sm:left-7 sm:top-14',
  right: 'absolute right-4 top-12 sm:right-7 sm:top-14',
  bottom: 'absolute left-1/2 -translate-x-1/2 bottom-9 sm:bottom-10',
}

export function TrickArea({ trick, winner, slotOf }: Props) {
  if (!trick || trick.cards.length === 0) {
    return null
  }
  return (
    <div className="relative h-full w-full min-h-[188px]">
      {trick.cards.map((pc) => (
        <div key={pc.seat} className={cn('flex flex-col items-center', POS[slotOf(pc.seat)])}>
          {/* CSS animacija ulaska karte (lagani pop) - bez extra biblioteke */}
          <div className="animate-card-in">
            <CardView card={pc.card} size="lg" winner={winner === pc.seat} />
          </div>
        </div>
      ))}
    </div>
  )
}
