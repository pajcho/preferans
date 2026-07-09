import type { Card, Rank, Seat, Suit, Trip } from './types.ts';
import { SUITS, RANKS } from './types.ts';

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

/** 0..7 (7 najslabiji, A najjači). */
export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function cardId(card: Card): string {
  return `${card.suit}:${card.rank}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Osnovni redosled za prikaz ruke: crna, crvena, crna, crvena. */
const DEFAULT_HAND_SUIT_ORDER: Suit[] = ['pik', 'karo', 'tref', 'herc'];

/** Bira redosled boja za prikaz ruke tako da izbegne dve crvene boje jednu do druge kad je moguće. */
export function handSuitOrder(cards: readonly Card[]): Suit[] {
  const present = new Set(cards.map((c) => c.suit));
  if (present.size !== 3) return DEFAULT_HAND_SUIT_ORDER;

  if (!present.has('karo')) return ['pik', 'herc', 'tref'];
  if (!present.has('tref')) return ['karo', 'pik', 'herc'];
  return DEFAULT_HAND_SUIT_ORDER;
}

/** Sortira ruku po boji (naizmenične boje) pa po jačini (za prikaz). */
export function sortHand(cards: readonly Card[]): Card[] {
  const suitOrder = Object.fromEntries(handSuitOrder(cards).map((suit, i) => [suit, i])) as Record<Suit, number>;
  return cards.slice().sort((a, b) => {
    if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
    return rankIndex(a.rank) - rankIndex(b.rank);
  });
}

/**
 * Talon (2 nepodeljene karte) = ceo špil minus tri početne ruke. Sirovi `state.talon` se
 * BRIŠE (`[]`) čim ga nosilac uzme (TAKE_TALON), pa se za pregled ruke ne može čitati odatle —
 * ali je uvek jednak komplementu 30 podeljenih karata, pa ga rekonstruišemo iz `initialHands`.
 */
export function talonFromDeal(initialHands: Trip<Card[]>): Card[] {
  const dealt = initialHands.flat();
  return buildDeck().filter((card) => !dealt.some((d) => sameCard(d, card)));
}

/**
 * Stvarne ruke KOJIMA se igralo — za pregled na kraju ruke (otkrivanje karata).
 * Branioci igraju podeljenih 10 (`initialHands`). Nosilac koji je uzeo talon igra
 * (podeljenih 10 + talon 2) − škart 2 = pravih 10 karata.
 *
 * Bez ovoga pregled je pokazivao POČETNU ruku nosioca: karte koje je bacio (škart) izgledale
 * su kao da su i dalje kod njega (a i u škartu → „duplirane"), a karte uzete iz talona kao da
 * fale (jer se sirovi talon izgubi na uzimanju). Vidi test reveal.test.ts.
 */
export function playedHands(initialHands: Trip<Card[]>, declarer: Seat | null, discard: readonly Card[]): Trip<Card[]> {
  const out = initialHands.map((hand) => hand.map((card) => ({ ...card }))) as Trip<Card[]>;
  // „igra" bez talona / prazna ruka (svi „dalje"): nosilac nije menjao karte
  if (declarer === null || discard.length === 0) return out;
  const full = [...initialHands[declarer], ...talonFromDeal(initialHands)];
  out[declarer] = full.filter((card) => !discard.some((d) => sameCard(d, card)));
  return out;
}
