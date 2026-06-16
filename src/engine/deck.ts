import type { Card, Rank } from './types'
import { SUITS, RANKS } from './types'

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank })
  return deck
}

/** 0..7 (7 najslabiji, A najjači). */
export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank)
}

export function cardId(card: Card): string {
  return `${card.suit}:${card.rank}`
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank
}

/** Sortira ruku po boji pa po jačini (za prikaz). */
export function sortHand(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)
    return rankIndex(a.rank) - rankIndex(b.rank)
  })
}
