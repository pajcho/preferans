import { describe, it, expect } from 'vitest';
import { createGame, reduce, currentActor, activeSeatCount } from '../reducer';
import { chooseAction } from '../ai';
import { newBidding, applyRaise } from '../bidding';
import { DEFAULT_CONFIG, SUITS } from '../types';
import type { BiddingState, Card, Difficulty, GameState, Rank, Suit } from '../types';

function playFullGame(seed: number, diff: Difficulty): GameState {
  let s = createGame({ ...DEFAULT_CONFIG, startingBule: 6, mandatoryKontraOnPik: false }, seed, 0);
  let guard = 0;
  while (s.phase !== 'gameOver' && guard++ < 8000) {
    if (s.phase === 'handScored') {
      s = reduce(s, { type: 'NEXT_HAND' });
      continue;
    }
    if (s.phase === 'playing' && s.trick && s.trick.cards.length === activeSeatCount(s)) {
      s = reduce(s, { type: 'RESOLVE_TRICK' });
      continue;
    }
    if (s.phase === 'claim') {
      s = reduce(s, { type: 'FINALIZE_CLAIM' });
      continue;
    }
    const actor = currentActor(s);
    if (actor === null) break;
    s = reduce(s, chooseAction(s, actor, diff));
  }
  return s;
}

describe('AI — 3 bota odigraju celu partiju', () => {
  it('medium: simulacija napreduje bez greške i odigra bar jednu ruku', () => {
    const s = playFullGame(2024, 'medium');
    expect(s.lastHand?.kind).toBe('played'); // partija se završava odigranom rukom (ne refe-om)
    // konzistentnost: ruka može završiti ranije kad odbrana skupi 5 štihova
    if (s.lastHand?.kind === 'played') {
      expect(s.lastHand.tricksWon.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
      expect(s.lastHand.tricksWon.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    }
    expect(s.handNo).toBeGreaterThan(1);
  });

  it('radi za sve nivoe bez greške', () => {
    for (const [seed, diff] of [
      [7, 'easy'],
      [42, 'medium'],
      [99, 'hard'],
    ] as const) {
      expect(playFullGame(seed, diff).lastHand).not.toBeNull();
    }
  });
});

// ── Pomoćnici za konstrukciju ruku i stanja licitacije ──

type HandSpec = Partial<Record<Suit, string>>;

/** hand({ pik: 'A K Q 9 7', herc: 'A 8' }) → Card[] */
function hand(spec: HandSpec): Card[] {
  const out: Card[] = [];
  for (const s of SUITS) {
    for (const r of (spec[s] ?? '').split(' ').filter(Boolean)) out.push({ suit: s, rank: r as Rank });
  }
  return out;
}

/** Stanje u licitaciji: bot je seat 0. Podrazumevano je on prvi na potezu (delilac 2). */
function bidState(hand0: Card[], opts: { talon?: Card[]; bidding?: BiddingState } = {}): GameState {
  const s = createGame(DEFAULT_CONFIG, 7, 2);
  return {
    ...s,
    hands: [hand0, s.hands[1], s.hands[2]],
    talon: opts.talon ?? s.talon,
    bidding: opts.bidding ?? s.bidding,
  };
}

/** Licitacija u kojoj su protivnici digli na 2 pa 3 — seat 0 je na potezu za „moje 3"/dalje. */
function raisedTo3(): BiddingState {
  return applyRaise(applyRaise(newBidding(0), 2), 3);
}

describe('AI — licitacija v2: adutske igre', () => {
  it('osrednja ruka (12 HCP bez pravog aduta) kaže „dalje"', () => {
    // stari kod bi sa ovim licitirao do 3; realno nosi ~2-3 štiha
    const h = hand({ pik: 'K Q J 8', herc: 'K 9', karo: 'Q 10', tref: 'J 7' });
    expect(chooseAction(bidState(h), 0, 'medium')).toEqual({ type: 'PASS', seat: 0 });
  });

  it('jaka adutska ruka ulazi u licitaciju', () => {
    const h = hand({ pik: 'A K Q 9 7', herc: 'A 8', karo: 'K 8', tref: '8' });
    expect(chooseAction(bidState(h), 0, 'medium')).toEqual({ type: 'RAISE', seat: 0, level: 2 });
  });

  it('ne kaže „moje" na nivou koji ruka ne pokriva (jak samo pik)', () => {
    const h = hand({ pik: 'A K Q 9 7', herc: 'A 8', karo: 'K 8', tref: '8' });
    const s = bidState(h, { bidding: raisedTo3() });
    // stari kod je BEZUSLOVNO preuzimao „moje"; sada: pik ne sme da se igra na nivou 3
    expect(chooseAction(s, 0, 'medium')).toEqual({ type: 'PASS', seat: 0 });
  });

  it('kaže „moje" kad ruka nosi taj nivo (jak herc pokriva nivo 3)', () => {
    const h = hand({ herc: 'A K Q 9 7', pik: 'A 8', karo: 'K 8', tref: '8' });
    const s = bidState(h, { bidding: raisedTo3() });
    expect(chooseAction(s, 0, 'medium')).toEqual({ type: 'HOLD', seat: 0 });
  });
});

describe('AI — licitacija v2: sans traži pokriće u svim bojama', () => {
  it('mnogo poena ali rupa u trefu → ne juri sans (staje na svom nivou)', () => {
    // stari sansStrength = 29 → jurio bi 7; tref 9 8 7 je nezaustavljiva boja
    const h = hand({ pik: 'A K Q J', karo: 'A K', herc: 'A', tref: '9 8 7' });
    const s = bidState(h, { bidding: raisedTo3() });
    expect(chooseAction(s, 0, 'medium')).toEqual({ type: 'PASS', seat: 0 });
  });

  it('stoperi u sve četiri boje + ≥6 sigurnih štihova → objavljuje sans', () => {
    const h = hand({ pik: 'A K Q', karo: 'A K Q', herc: 'A K', tref: 'A 7' });
    expect(chooseAction(bidState(h), 0, 'medium')).toEqual({ type: 'IGRA', seat: 0, level: 7 });
  });
});

describe('AI — licitacija v2: betl traži prolaz po bojama', () => {
  it('dve boje sa visokom najnižom kartom → „dalje"', () => {
    const h = hand({ pik: '7 8 9', herc: '7 8 9', karo: 'J 10', tref: 'Q 7' });
    expect(chooseAction(bidState(h), 0, 'medium')).toEqual({ type: 'PASS', seat: 0 });
  });

  it('čist betl (sve boje prolaze) → ulazi u licitaciju ka betlu', () => {
    const h = hand({ pik: '10 9 8 7', herc: '8 7', karo: '8 7', tref: '8 7' });
    expect(chooseAction(bidState(h), 0, 'medium')).toEqual({ type: 'IGRA', seat: 0, level: 6 });
  });
});

describe('AI — licitacija v2: hard viri u talon', () => {
  it('ruka na ivici betla: medium pas, hard vidi da talon krpi rupu i licitira', () => {
    const h = hand({ pik: '7 8 9', herc: '7 8', karo: 'Q J', tref: '9 8 7' });
    const talon: Card[] = [
      { suit: 'karo', rank: '7' },
      { suit: 'karo', rank: '8' },
    ];
    const s = bidState(h, { talon });
    expect(chooseAction(s, 0, 'medium')).toEqual({ type: 'PASS', seat: 0 });
    expect(chooseAction(s, 0, 'hard')).toEqual({ type: 'RAISE', seat: 0, level: 2 });
  });
});

describe('AI — škart prati plan igre', () => {
  it('betl na nivou 6: škartira opasne visoke karte, ne najniže', () => {
    const h12 = hand({ pik: '9 8 7', herc: 'A 8 7', karo: 'K 7', tref: '10 9 8 7' });
    const s0 = createGame(DEFAULT_CONFIG, 7, 2);
    const s: GameState = {
      ...s0,
      phase: 'talon',
      talonTaken: true,
      wonLevel: 6,
      wonAsIgra: false,
      declarer: 0,
      hands: [h12, s0.hands[1], s0.hands[2]],
    };
    const a = chooseAction(s, 0, 'medium');
    expect(a.type).toBe('DISCARD');
    if (a.type === 'DISCARD') {
      const thrown = a.cards.map((c) => `${c.suit}${c.rank}`).sort();
      // stari kod je za betl bacao dve NAJNIŽE karte i ostajao sa kecom u ruci
      expect(thrown).toEqual(['hercA', 'karoK']);
    }
  });

  it('posle takvog škarta objavljuje betl', () => {
    const kept = hand({ pik: '9 8 7', herc: '8 7', karo: '7', tref: '10 9 8 7' });
    const discard = hand({ herc: 'A', karo: 'K' });
    const s0 = createGame(DEFAULT_CONFIG, 7, 2);
    const s: GameState = {
      ...s0,
      phase: 'talon',
      talonTaken: true,
      wonLevel: 6,
      wonAsIgra: false,
      declarer: 0,
      discard,
      hands: [kept, s0.hands[1], s0.hands[2]],
    };
    const a = chooseAction(s, 0, 'medium');
    expect(a.type).toBe('DECLARE');
    if (a.type === 'DECLARE') expect(a.contract).toEqual({ kind: 'betl', asGame: false });
  });
});
