import type { Card, Rank, Suit } from './types.ts'
import { SUITS, RANKS } from './types.ts'

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

/** Osnovni redosled za prikaz ruke: crna, crvena, crna, crvena. */
const DEFAULT_HAND_SUIT_ORDER: Suit[] = ['pik', 'karo', 'tref', 'herc']

/** Bira redosled boja za prikaz ruke tako da izbegne dve crvene boje jednu do druge kad je moguće. */
export function handSuitOrder(cards: readonly Card[]): Suit[] {
  const present = new Set(cards.map((c) => c.suit))
  if (present.size !== 3) return DEFAULT_HAND_SUIT_ORDER

  if (!present.has('karo')) return ['pik', 'herc', 'tref']
  if (!present.has('tref')) return ['karo', 'pik', 'herc']
  return DEFAULT_HAND_SUIT_ORDER
}

/** Sortira ruku po boji (naizmenične boje) pa po jačini (za prikaz). */
export function sortHand(cards: readonly Card[]): Card[] {
  const suitOrder = Object.fromEntries(handSuitOrder(cards).map((suit, i) => [suit, i])) as Record<Suit, number>
  return cards.slice().sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit]
    return rankIndex(a.rank) - rankIndex(b.rank)
  })
}
