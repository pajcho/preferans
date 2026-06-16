import { CardView } from './CardView'
import { cardId } from '@engine'
import type { Card } from '@engine'

interface Props {
  cards: Card[]
  /** ako je prosleđeno, samo te karte su klikabilne (ostale zatamnjene) */
  legalIds?: Set<string>
  selectedIds?: Set<string>
  interactive?: boolean
  onCardClick?: (card: Card) => void
}

export function Hand({ cards, legalIds, selectedIds, interactive, onCardClick }: Props) {
  return (
    <div className="flex justify-center items-end px-2 pt-3">
      {cards.map((c, i) => {
        const id = cardId(c)
        const legal = legalIds ? legalIds.has(id) : true
        const clickable = !!(interactive && onCardClick && legal)
        return (
          <div key={id} className={i === 0 ? '' : '-ml-7 sm:-ml-5'}>
            <CardView
              card={c}
              size="lg"
              selected={selectedIds?.has(id)}
              dim={interactive && legalIds ? !legal : false}
              onClick={clickable ? () => onCardClick!(c) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
