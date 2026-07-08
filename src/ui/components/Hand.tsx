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
  const count = cards.length
  const cardWidth = 58
  const maxVisibleStep = cardWidth * 0.75
  const maxWidth = count >= 12 ? 470 : Math.ceil(cardWidth + maxVisibleStep * Math.max(0, count - 1))

  return (
    <div
      className="relative mx-auto h-[104px] max-w-[calc(100vw-16px)] overflow-visible pt-3"
      style={{ width: `min(calc(100vw - 16px), ${maxWidth}px)` }}
    >
      {cards.map((c, i) => {
        const id = cardId(c)
        const legal = legalIds ? legalIds.has(id) : true
        const clickable = !!(interactive && onCardClick && legal)
        const left =
          count <= 1 ? `calc(50% - ${cardWidth / 2}px)` : `calc((100% - ${cardWidth}px) * ${i} / ${count - 1})`
        const isSelected = selectedIds?.has(id)
        return (
          <div key={id} className="absolute bottom-3" style={{ left, zIndex: i + 1 }}>
            <CardView
              card={c}
              size="lg"
              framed
              selected={isSelected}
              dim={interactive && legalIds ? !legal : false}
              onClick={clickable ? () => onCardClick!(c) : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}
