import type { Card, CompletedTrick, PlayedCard, Seat } from '@engine'

export function orderedTrickCards(cards: PlayedCard[], seats: [Seat, Seat, Seat]): Array<Card | undefined> {
  return seats.map((seat) => cards.find((pc) => pc.seat === seat)?.card)
}

export interface TrickFlowColumn {
  trickNo: number
  winner?: Seat
  cardsByRow: Array<Card | undefined>
  seatsByRow: Array<Seat | undefined>
}

function firstFittingRow(seats: readonly Seat[], seat: Seat, cardCount: number): number {
  const index = seats.findIndex((candidate, row) => candidate === seat && row + cardCount <= seats.length)
  return Math.max(0, index)
}

export function trickFlowColumns(
  tricks: CompletedTrick[],
  rowSeats: readonly Seat[],
  maxTricks = 10,
): TrickFlowColumn[] {
  return Array.from({ length: maxTricks }, (_, index) => {
    const trick = tricks[index]
    const cardsByRow = rowSeats.map(() => undefined) as Array<Card | undefined>
    const seatsByRow = rowSeats.map(() => undefined) as Array<Seat | undefined>

    if (trick?.cards.length) {
      const startRow = firstFittingRow(rowSeats, trick.cards[0].seat, trick.cards.length)
      trick.cards.forEach((played, offset) => {
        const row = startRow + offset
        if (row >= rowSeats.length) return
        cardsByRow[row] = played.card
        seatsByRow[row] = played.seat
      })
    }

    return {
      trickNo: index + 1,
      winner: trick?.winner,
      cardsByRow,
      seatsByRow,
    }
  })
}
