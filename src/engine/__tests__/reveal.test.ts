import { describe, it, expect } from 'vitest';
import { buildDeck, cardId, playedHands, talonFromDeal } from '../deck';
import { createGameWithHands, currentActor, reduce } from '../reducer';
import { DEFAULT_CONFIG } from '../types';
import type { Card, GameState, Seat, Trip } from '../types';

const c = (suit: Card['suit'], rank: Card['rank']): Card => ({ suit, rank });
const ids = (cards: Card[]): string[] => cards.map(cardId).sort();
const has = (cards: Card[], card: Card): boolean => cards.some((x) => cardId(x) === cardId(card));

// Scenario iz produkcije (partija QHGBQC, ruka 1): nosilac (sedište 1) je podeljen 8♣ ali NE A♣;
// talon drži A♣. Uzme talon, baci 8♣ (i 7♦), a A♣ zadrži i odigra. Komplement 30 podeljenih
// karata je tačno [7♦, A♣] → talon.
const A_CLUB = c('tref', 'A');
const EIGHT_CLUB = c('tref', '8');
const SEVEN_DIAMOND = c('karo', '7');

const initialHands: Trip<Card[]> = [
  [
    c('pik', '7'),
    c('pik', '8'),
    c('pik', '9'),
    c('pik', '10'),
    c('pik', 'J'),
    c('pik', 'Q'),
    c('pik', 'K'),
    c('pik', 'A'),
    c('karo', '8'),
    c('karo', '9'),
  ],
  // sedište 1 — NOSILAC: ima 8♣, nema A♣
  [
    c('herc', '7'),
    c('herc', '8'),
    c('herc', '9'),
    c('herc', '10'),
    c('herc', 'J'),
    c('herc', 'Q'),
    c('herc', 'K'),
    c('herc', 'A'),
    EIGHT_CLUB,
    c('karo', '10'),
  ],
  [
    c('karo', 'J'),
    c('karo', 'Q'),
    c('karo', 'K'),
    c('karo', 'A'),
    c('tref', '7'),
    c('tref', '9'),
    c('tref', '10'),
    c('tref', 'J'),
    c('tref', 'Q'),
    c('tref', 'K'),
  ],
];
const discard: Card[] = [EIGHT_CLUB, SEVEN_DIAMOND];

describe('talonFromDeal', () => {
  it('rekonstruiše talon kao komplement 30 podeljenih karata', () => {
    expect(ids(talonFromDeal(initialHands))).toEqual(ids([A_CLUB, SEVEN_DIAMOND]));
  });
});

describe('playedHands — pregled otkriva STVARNE odigrane ruke', () => {
  it('nosiočeva ruka = podeljenih 10 + talon − škart (A♣ unutra, 8♣ napolju)', () => {
    const hands = playedHands(initialHands, 1, discard);
    expect(hands[1]).toHaveLength(10);
    expect(has(hands[1], A_CLUB)).toBe(true); // uzeta iz talona i zadržana → u ruci
    expect(has(hands[1], EIGHT_CLUB)).toBe(false); // bačena → NIJE u ruci
    expect(has(hands[1], SEVEN_DIAMOND)).toBe(false); // bačena → NIJE u ruci
  });

  it('ne duplira i ne gubi karte: sve odigrane ruke + škart = pun špil (32)', () => {
    const hands = playedHands(initialHands, 1, discard);
    const all = [...hands[0], ...hands[1], ...hands[2], ...discard];
    expect(all).toHaveLength(32);
    expect(ids(all)).toEqual(ids(buildDeck())); // bez duplikata, ništa ne fali
  });

  it('branioci ostaju podeljeni (bez talona)', () => {
    const hands = playedHands(initialHands, 1, discard);
    expect(ids(hands[0])).toEqual(ids(initialHands[0]));
    expect(ids(hands[2])).toEqual(ids(initialHands[2]));
  });

  it('„igra" bez talona (prazan škart) → ruke nepromenjene', () => {
    const hands = playedHands(initialHands, 1, []);
    expect(ids(hands[1])).toEqual(ids(initialHands[1]));
  });
});

describe('kraj ruke kroz reducer → pregled je ispravan (regresija za QHGBQC)', () => {
  it('lastHand + playedHands: A♣ kod nosioca, 8♣ samo u škartu', () => {
    let g: GameState = createGameWithHands(DEFAULT_CONFIG, 0, initialHands, [A_CLUB, SEVEN_DIAMOND]);
    g = reduce(g, { type: 'RAISE', seat: 1, level: 2 });
    g = reduce(g, { type: 'PASS', seat: 2 });
    g = reduce(g, { type: 'PASS', seat: 0 });
    g = reduce(g, { type: 'TAKE_TALON', seat: 1 });
    while (g.talonReveal) g = reduce(g, { type: 'ACK_TALON', seat: currentActor(g) as Seat });
    g = reduce(g, { type: 'DISCARD', seat: 1, cards: [EIGHT_CLUB, SEVEN_DIAMOND] });
    g = reduce(g, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'herc', asGame: false } });
    // nijedan branilac ne dođe → nosilac nosi sve, ruka se boduje odmah
    g = reduce(g, { type: 'FOLLOW', seat: 2, value: false });
    g = reduce(g, { type: 'FOLLOW', seat: 0, value: false });

    expect(g.phase).toBe('handScored');
    expect(g.lastHand?.kind).toBe('played');
    const last = g.lastHand!;
    if (last.kind !== 'played') throw new Error('očekivana odigrana ruka');

    const reveal = playedHands(last.initialHands, last.declarer, last.discard);
    expect(has(reveal[last.declarer], A_CLUB)).toBe(true);
    expect(has(reveal[last.declarer], EIGHT_CLUB)).toBe(false);
    expect(has(last.discard, EIGHT_CLUB)).toBe(true);
    // pun špil, bez duplikata
    expect(ids([...reveal[0], ...reveal[1], ...reveal[2], ...last.discard])).toEqual(ids(buildDeck()));
  });
});
