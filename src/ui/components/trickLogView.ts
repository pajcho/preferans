import type { Card, PlayedCard, Seat } from '@engine'

export function orderedTrickCards(cards: PlayedCard[], seats: [Seat, Seat, Seat]): Array<Card | undefined> {
  return seats.map((seat) => cards.find((pc) => pc.seat === seat)?.card)
}
