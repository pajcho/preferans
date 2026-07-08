import type { Card, Suit, PlayedCard } from './types.ts';
import { rankIndex } from './deck.ts';

export interface PlayOpts {
  mustOvertrump?: boolean;
  mustHeadSuit?: boolean;
}

/**
 * Koje karte iz `hand` smeju da se odigraju na tekući štih.
 * Obaveze (docs/RULES.md §8): prati boju → ako ne možeš, seci adutom → inače bilo šta.
 * mustHeadSuit / mustOvertrump su kućna pravila (default off).
 */
export function legalCards(
  hand: readonly Card[],
  trickCards: readonly PlayedCard[],
  trump: Suit | null,
  opts: PlayOpts = {},
): Card[] {
  if (trickCards.length === 0) return hand.slice(); // vodeći igra šta hoće

  const leadSuit = trickCards[0].card.suit;

  if (hand.some((c) => c.suit === leadSuit)) {
    let candidates = hand.filter((c) => c.suit === leadSuit);
    if (opts.mustHeadSuit) {
      const best = highestOfSuit(trickCards, leadSuit);
      const beating = candidates.filter((c) => rankIndex(c.rank) > best);
      if (beating.length) candidates = beating;
    }
    return candidates;
  }

  if (trump && hand.some((c) => c.suit === trump)) {
    let candidates = hand.filter((c) => c.suit === trump);
    if (opts.mustOvertrump) {
      const highTrump = highestOfSuit(trickCards, trump);
      if (highTrump >= 0) {
        const beating = candidates.filter((c) => rankIndex(c.rank) > highTrump);
        if (beating.length) candidates = beating;
      }
    }
    return candidates;
  }

  return hand.slice(); // nema ni traženu boju ni adut
}

function highestOfSuit(cards: readonly PlayedCard[], suit: Suit): number {
  let best = -1;
  for (const pc of cards) {
    if (pc.card.suit === suit) best = Math.max(best, rankIndex(pc.card.rank));
  }
  return best;
}

/** Ko nosi štih: najjači adut; ako nema aduta, najjača karta tražene boje. */
export function trickWinner(cards: readonly PlayedCard[], trump: Suit | null): PlayedCard {
  if (cards.length === 0) throw new Error('prazan štih');
  const leadSuit = cards[0].card.suit;
  const trumps = trump ? cards.filter((pc) => pc.card.suit === trump) : [];
  const pool = trumps.length ? trumps : cards.filter((pc) => pc.card.suit === leadSuit);
  return pool.reduce((best, pc) => (rankIndex(pc.card.rank) > rankIndex(best.card.rank) ? pc : best));
}
