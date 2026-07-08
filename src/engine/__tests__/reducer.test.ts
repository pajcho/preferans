import { describe, it, expect } from 'vitest';
import { activeSeatCount, createGame, invitedSeat, reduce, currentActor, legalActions } from '../reducer';
import { redactFor } from '../playerView';
import { DEFAULT_CONFIG } from '../types';
import type { Card, Contract, GameState, Seat } from '../types';

// auto-finish isključen ovde da bi se odigrali svi štihovi (claim ima svoj test)
const cfg = { ...DEFAULT_CONFIG, startingBule: 30, mandatoryKontraOnPik: false, autoFinish: false };

function acknowledgeTalon(s: GameState): GameState {
  let state = s;
  while (state.talonReveal) {
    const actor = currentActor(state);
    expect(actor).not.toBeNull();
    state = reduce(state, { type: 'ACK_TALON', seat: actor! });
  }
  return state;
}

function takeTalon(s: GameState, seat: Seat): GameState {
  const talon = s.talon.slice();
  const state = reduce(s, { type: 'TAKE_TALON', seat });
  expect(state.talonReveal?.cards).toEqual(talon);
  return acknowledgeTalon(state);
}

describe('reducer — pun tok jedne ruke', () => {
  it('od deljenja do bodovanja', () => {
    let s = createGame(cfg, 12345, 0);
    expect(s.phase).toBe('bidding');
    expect(s.hands[0]).toHaveLength(10);
    expect(s.talon).toHaveLength(2);

    // forehand = desno od delioca(0) = 1; otvori 2, ostali "dalje" → nosilac 1
    expect(currentActor(s)).toBe(1);
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.phase).toBe('talon');
    expect(s.declarer).toBe(1);
    expect(s.bidLog).toEqual([
      { seat: 1, kind: 'raise', level: 2 },
      { seat: 2, kind: 'pass' },
      { seat: 0, kind: 'pass' },
    ]);

    // uzmi talon, baci 2, prijavi pik
    s = takeTalon(s, 1);
    expect(s.hands[1]).toHaveLength(12);
    const toss = s.hands[1].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss });
    expect(s.hands[1]).toHaveLength(10);
    expect(s.discard).toHaveLength(2);
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'pik', asGame: false } });
    expect(s.phase).toBe('following');

    // oba pratioca prate → kontra-runda
    s = reduce(s, { type: 'FOLLOW', seat: currentActor(s)!, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: currentActor(s)!, value: true });
    expect(s.phase).toBe('kontra');
    // jedan branilac da kontru, nosilac ne rekontrira
    const def = currentActor(s)!;
    s = reduce(s, { type: 'KONTRA', seat: def });
    expect(s.kontra).toBe(1);
    expect(currentActor(s)).toBe(s.declarer);
    s = reduce(s, { type: 'PROCEED' });
    expect(s.phase).toBe('playing');
    expect(s.kontra).toBe(1);

    // odigraj sve štihove (prva legalna karta)
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 80) {
      if (s.trick && s.trick.cards.length === 3) {
        s = reduce(s, { type: 'RESOLVE_TRICK' });
        continue;
      }
      const plays = legalActions(s).filter((a) => a.type === 'PLAY');
      expect(plays.length).toBeGreaterThan(0);
      s = reduce(s, plays[0]);
    }

    expect(s.tricksPlayed).toBeGreaterThan(0);
    expect(s.tricksPlayed).toBeLessThanOrEqual(10);
    expect(s.tricksWon[0] + s.tricksWon[1] + s.tricksWon[2]).toBe(s.tricksPlayed);
    expect(['handScored', 'gameOver']).toContain(s.phase);
    expect(s.lastHand?.kind).toBe('played');
    if (s.lastHand?.kind === 'played') {
      expect(s.lastHand.declarer).toBe(1);
      expect(s.lastHand.initialHands.map((hand) => hand.length)).toEqual([10, 10, 10]);
      expect(s.lastHand.discard).toEqual(toss);
    }
  });

  it('svi "dalje" → pauza (refe svima), pa NEXT_HAND deli (rotiran delilac)', () => {
    let s = createGame({ ...cfg, maxRefe: 2 }, 7, 0);
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    // prazna ruka: pauza na handScored (otkrivene karte), refe upisan svima
    expect(s.phase).toBe('handScored');
    expect(s.handNo).toBe(1);
    expect(s.lastHand?.kind).toBe('refe');
    expect(s.ledger.refe).toEqual([1, 1, 1]);
    expect(s.scoreHistory.map((entries) => entries[entries.length - 1])).toEqual([
      { kind: 'refe', handNo: 1, used: false },
      { kind: 'refe', handNo: 1, used: false },
      { kind: 'refe', handNo: 1, used: false },
    ]);
    // NEXT_HAND deli sledeću ruku sa rotiranim deliocem
    s = reduce(s, { type: 'NEXT_HAND' });
    expect(s.phase).toBe('bidding');
    expect(s.dealer).toBe(1);
    expect(s.handNo).toBe(2);
  });

  it('igrač koji kaže "ne dođem" ne igra štih', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    const toss = s.hands[1].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });

    s = reduce(s, { type: 'FOLLOW', seat: 2, value: false });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });
    expect(s.phase).toBe('kontra');
    expect(activeSeatCount(s)).toBe(2);

    s = reduce(s, { type: 'PROCEED' });
    expect(s.phase).toBe('playing');
    expect(currentActor(s)).toBe(1);

    const firstPlay = legalActions(s).find((a) => a.type === 'PLAY');
    expect(firstPlay).toBeDefined();
    s = reduce(s, firstPlay!);
    expect(currentActor(s)).toBe(0);
    expect(() => reduce(s, { type: 'PLAY', seat: 2, card: s.hands[2][0] })).toThrow(/ne učestvuje/);

    const secondPlay = legalActions(s).find((a) => a.type === 'PLAY');
    expect(secondPlay).toBeDefined();
    s = reduce(s, secondPlay!);
    expect(s.trick?.cards).toHaveLength(2);
    expect(currentActor(s)).toBeNull();

    s = reduce(s, { type: 'RESOLVE_TRICK' });
    expect(s.tricksPlayed).toBe(1);
    expect(s.tricksWon[0] + s.tricksWon[1] + s.tricksWon[2]).toBe(1);
    expect(s.hands[2]).toHaveLength(10);
  });

  it('ne-betl ruka se odmah boduje kad odbrana skupi 5 štihova', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });
    while (s.phase === 'kontra') s = reduce(s, { type: 'PROCEED', seat: currentActor(s)! });

    s = {
      ...s,
      tricksWon: [2, 3, 2],
      tricksPlayed: 7,
      trick: {
        leader: 1,
        cards: [
          { seat: 1, card: { suit: 'pik', rank: '7' } },
          { seat: 2, card: { suit: 'pik', rank: '8' } },
          { seat: 0, card: { suit: 'pik', rank: 'A' } },
        ],
      },
    };

    s = reduce(s, { type: 'RESOLVE_TRICK' });

    expect(s.phase).toBe('handScored');
    expect(s.trick).toBeNull();
    expect(s.tricksPlayed).toBe(8);
    expect(s.tricksWon).toEqual([3, 3, 2]);
    expect(s.lastHand?.kind).toBe('played');
    if (s.lastHand?.kind === 'played') {
      expect(s.lastHand.passed).toBe(false);
      expect(s.lastHand.tricksWon).toEqual([3, 3, 2]);
    }
    expect(s.ledger.supe[0][1] + s.ledger.supe[2][1]).toBe(50);
  });

  it('kontra-runda pita i drugog pratioca pre početka igre', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    const toss = s.hands[1].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });

    expect(s.phase).toBe('kontra');
    expect(currentActor(s)).toBe(2);
    s = reduce(s, { type: 'PROCEED', seat: 2 });
    expect(s.phase).toBe('kontra');
    expect(currentActor(s)).toBe(0);
    s = reduce(s, { type: 'KONTRA', seat: 0 });
    expect(s.kontra).toBe(1);
    expect(s.kontraBy).toBe(0);
    expect(currentActor(s)).toBe(1);
  });

  it('posle kontre treći igrač se ne pita; rekontra ide samo nosiocu pa subkontra kontriraču', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });

    expect(currentActor(s)).toBe(2);
    s = reduce(s, { type: 'KONTRA', seat: 2 });
    expect(s.following).toEqual([true, false, true]);
    expect(s.kontraBy).toBe(2);
    expect(currentActor(s)).toBe(1);
    expect(() => reduce(s, { type: 'KONTRA', seat: 0 })).toThrow(/nije tvoj red/);

    s = reduce(s, { type: 'KONTRA', seat: 1 });
    expect(s.kontra).toBe(2);
    expect(currentActor(s)).toBe(2);
    expect(legalActions(s)).toEqual([
      { type: 'KONTRA', seat: 2 },
      { type: 'PROCEED', seat: 2 },
    ]);

    s = reduce(s, { type: 'PROCEED', seat: 2 });
    expect(s.phase).toBe('playing');
    expect(s.kontra).toBe(2);
  });

  it('pratilac može da zove nepratioca i tada igraju sva trojica', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    const toss = s.hands[1].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: false });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });

    expect(currentActor(s)).toBe(0);
    expect(legalActions(s)).toContainEqual({ type: 'INVITE', seat: 0 });
    s = reduce(s, { type: 'INVITE', seat: 0 });
    expect(s.inviteCaller).toBe(0);
    expect(s.following).toEqual([true, false, true]);
    expect(activeSeatCount(s)).toBe(3);
    expect(s.phase).toBe('playing');
    expect(activeSeatCount(s)).toBe(3);
    expect(s.kontra).toBe(0);
    // pozvani (pomoćnik) = treći za stolom: nosilac 1, pozivač 0 → 2
    expect(invitedSeat(s.declarer!, s.inviteCaller!)).toBe(2);
    expect(s.following[invitedSeat(s.declarer!, s.inviteCaller!)]).toBe(true);
  });

  it('invitedSeat vraća trećeg (ni nosioca ni pozivača) za sve rasporede', () => {
    expect(invitedSeat(0, 1)).toBe(2);
    expect(invitedSeat(0, 2)).toBe(1);
    expect(invitedSeat(1, 0)).toBe(2);
    expect(invitedSeat(1, 2)).toBe(0);
    expect(invitedSeat(2, 0)).toBe(1);
    expect(invitedSeat(2, 1)).toBe(0);
  });

  it('ako jedini pratilac izabere kontru, to je finalno i nepratilac automatski igra bez izbora', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: false });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });

    expect(legalActions(s)).toEqual([
      { type: 'INVITE', seat: 0 },
      { type: 'KONTRA', seat: 0 },
      { type: 'PROCEED', seat: 0 },
    ]);

    s = reduce(s, { type: 'KONTRA', seat: 0 });
    expect(s.following).toEqual([true, false, true]);
    expect(s.kontraBy).toBe(0);
    expect(currentActor(s)).toBe(1);
    expect(() => reduce(s, { type: 'INVITE', seat: 0 })).toThrow(/nije faza pozivanja|nije tvoj red/);

    s = reduce(s, { type: 'PROCEED', seat: 1 });
    expect(s.phase).toBe('playing');
    expect(activeSeatCount(s)).toBe(3);
  });

  it('betl automatski uključuje oba pratioca, ali i dalje ima kontra-rundu', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'RAISE', seat: 2, level: 3 });
    s = reduce(s, { type: 'HOLD', seat: 0 });
    s = reduce(s, { type: 'RAISE', seat: 1, level: 4 });
    s = reduce(s, { type: 'HOLD', seat: 2 });
    s = reduce(s, { type: 'RAISE', seat: 0, level: 5 });
    s = reduce(s, { type: 'HOLD', seat: 1 });
    s = reduce(s, { type: 'RAISE', seat: 2, level: 6 });
    s = reduce(s, { type: 'HOLD', seat: 0 });
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    expect(s.declarer).toBe(0);
    s = takeTalon(s, 0);
    const toss = s.hands[0].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 0, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 0, contract: { kind: 'betl', asGame: false } });

    expect(s.phase).toBe('kontra');
    expect(s.following).toEqual([false, true, true]);
    expect(currentActor(s)).toBe(1);
    s = reduce(s, { type: 'KONTRA', seat: 1 });
    expect(s.kontra).toBe(1);
    expect(s.kontraBy).toBe(1);
    expect(currentActor(s)).toBe(0);
  });

  it('dozvoljava „dalje" na ponuđeno „moje", ali odbija dizanje pre razrešenja', () => {
    let s = createGame(cfg, 12345, 0);
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'RAISE', seat: 2, level: 3 });
    expect(() => reduce(s, { type: 'RAISE', seat: 0, level: 4 })).toThrow(/nelegalna licitacija/);
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.phase).toBe('bidding');
    expect(currentActor(s)).toBe(1);
  });

  it('kad niko ne prati, ruka se odmah boduje kao prolaz nosioca', () => {
    let s = createGame(cfg, 12345, 0);

    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    const toss = s.hands[1].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'tref', asGame: false } });

    s = reduce(s, { type: 'FOLLOW', seat: 2, value: false });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: false });

    expect(s.phase).toBe('handScored');
    expect(s.tricksPlayed).toBe(10);
    expect(s.tricksWon).toEqual([0, 10, 0]);
    expect(s.lastHand?.kind).toBe('played');
    if (s.lastHand?.kind === 'played') {
      expect(s.lastHand.passed).toBe(true);
      expect(s.lastHand.tricksWon).toEqual([0, 10, 0]);
    }
    expect(s.ledger.bule[1]).toBe(20); // Tref prolaz: 30 - (5×2)
    expect(s.scoreHistory[1][s.scoreHistory[1].length - 1]).toEqual({ kind: 'bule', handNo: 1, value: 20, delta: -10 });
    expect(s.ledger.supe[0][1]).toBe(0);
    expect(s.ledger.supe[2][1]).toBe(0);
    expect(s.hands[0]).toHaveLength(10);
    expect(s.hands[1]).toHaveLength(10);
    expect(s.hands[2]).toHaveLength(10);
  });

  it('svi „dalje" → pauza (prazna ruka + refe), pa NEXT_HAND deli; iskorišćen refe se označi', () => {
    let s = createGame({ ...cfg, maxRefe: 2 }, 7, 0);

    // svi „dalje" → refe upisan SVIMA; pauziramo na handScored (prazna ruka), ne delimo odmah
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.phase).toBe('handScored');
    expect(s.handNo).toBe(1);
    expect(s.ledger.refe).toEqual([1, 1, 1]);
    expect(s.lastHand?.kind).toBe('refe');
    if (s.lastHand?.kind === 'refe') {
      expect(s.lastHand.handNo).toBe(1);
      expect(s.lastHand.refeWritten).toBe(true);
      expect(s.lastHand.initialHands.flat()).toHaveLength(30); // otkrivene karte za pregled
      expect(s.lastHand.talon).toHaveLength(2);
    }
    // NEXT_HAND rotira delioca i deli sledeću ruku
    s = reduce(s, { type: 'NEXT_HAND' });
    expect(s.phase).toBe('bidding');
    expect(s.handNo).toBe(2);

    s = reduce(s, { type: 'RAISE', seat: 2, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = takeTalon(s, 2);
    const toss = s.hands[2].slice(0, 2) as [Card, Card];
    s = reduce(s, { type: 'DISCARD', seat: 2, cards: toss });
    s = reduce(s, { type: 'DECLARE', seat: 2, contract: { kind: 'suit', trump: 'tref', asGame: false } });

    s = reduce(s, { type: 'FOLLOW', seat: 0, value: false });
    s = reduce(s, { type: 'FOLLOW', seat: 1, value: false });

    expect(s.phase).toBe('handScored');
    expect(s.ledger.refe[2]).toBe(0);
    expect(s.scoreHistory[2]).toContainEqual({ kind: 'refe', handNo: 1, used: true });
    expect(s.scoreHistory[2][s.scoreHistory[2].length - 1]).toMatchObject({ kind: 'bule', handNo: 2 });
  });
});

describe('playerView — skrivanje karata', () => {
  it('vidiš samo svoju ruku; za ostale samo broj', () => {
    const s = createGame(cfg, 99, 0);
    const v = redactFor(0, s);
    expect(v.hand).toHaveLength(10);
    expect(v.handCounts).toEqual([10, 10, 10]);
    expect(v.talonCount).toBe(2);
    expect(v.talon).toHaveLength(0); // talon nije otkriven
    expect(v.yourTurn).toBe(currentActor(s) === 0);
  });

  it('talon je javan u fazi talona i posle uzimanja čeka potvrdu ostalih igrača', () => {
    let s = createGame(cfg, 12345, 0);
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.phase).toBe('talon');

    const opened = s.talon.slice();
    expect(redactFor(0, s).talon).toEqual(opened);
    expect(redactFor(1, s).talon).toEqual(opened);
    expect(redactFor(2, s).talon).toEqual(opened);

    s = reduce(s, { type: 'TAKE_TALON', seat: 1 });
    expect(s.talonReveal?.cards).toEqual(opened);
    expect(currentActor(s)).toBe(0);
    expect(() => reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] })).toThrow(
      /prvo potvrdi/,
    );
    expect(redactFor(0, s).talon).toEqual(opened);
    expect(redactFor(2, s).talon).toEqual(opened);

    s = reduce(s, { type: 'ACK_TALON', seat: 0 });
    expect(currentActor(s)).toBe(2);
    s = reduce(s, { type: 'ACK_TALON', seat: 2 });
    expect(s.talonReveal).toBeNull();
    expect(currentActor(s)).toBe(1);
  });
});

describe('reducer — ko vodi prvi štih (forhand vs. sans-izuzetak)', () => {
  // delilac 0 → forhand 1; forhand digne na 2, ostali „dalje" → nosilac je seat 1
  function declareAndFollow(contract: Contract) {
    let s = createGame(cfg, 12345, 0);
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract });
    expect(s.declarer).toBe(1);
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });
    let guard = 0;
    while (s.phase === 'kontra' && guard++ < 6) s = reduce(s, { type: 'PROCEED', seat: currentActor(s)! });
    expect(s.phase).toBe('playing');
    return s;
  }

  it('adutska igra: prvi štih vodi forhand (desno od delioca)', () => {
    const s = declareAndFollow({ kind: 'suit', trump: 'tref', asGame: false });
    expect(s.trick!.leader).toBe(1); // forhand = right(dealer 0) = 1
  });

  it('Sans: prvi štih vodi pratilac LEVO od nosioca (right(right(declarer)))', () => {
    const s = declareAndFollow({ kind: 'sans', asGame: false });
    expect(s.trick!.leader).toBe(0); // nosilac 1 → levi pratilac = right(right(1)) = 0
  });
});

describe('reducer — refe pravila', () => {
  it('all-pass: refe se upisuje SVIMA kad niko nije u minusu', () => {
    let s = createGame(cfg, 7, 0); // delilac 0 → forhand 1
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.ledger.refe).toEqual([1, 1, 1]);
  });

  it('all-pass: ako je IKO u minusu, refe se ne piše nikom', () => {
    let s = createGame(cfg, 7, 0);
    s = { ...s, ledger: { ...s.ledger, bule: [-5, 10, 10] } }; // seat 0 ispod kape
    s = reduce(s, { type: 'PASS', seat: 1 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    expect(s.ledger.refe).toEqual([0, 0, 0]);
  });

  // delilac 0 → forhand 1 digne na 2, ostali „dalje" → nosilac 1 prijavi pik; oba prate, niko ne kontrira.
  // `mutate` (opciono) menja stanje POSLE prijave — npr. podešavanje ledgera.
  function pikNoKontra(config: typeof cfg, mutate?: (s: GameState) => GameState) {
    let s = createGame(config, 12345, 0);
    s = reduce(s, { type: 'RAISE', seat: 1, level: 2 });
    s = reduce(s, { type: 'PASS', seat: 2 });
    s = reduce(s, { type: 'PASS', seat: 0 });
    s = takeTalon(s, 1);
    s = reduce(s, { type: 'DISCARD', seat: 1, cards: s.hands[1].slice(0, 2) as [Card, Card] });
    s = reduce(s, { type: 'DECLARE', seat: 1, contract: { kind: 'suit', trump: 'pik', asGame: false } });
    if (mutate) s = mutate(s);
    s = reduce(s, { type: 'FOLLOW', seat: 2, value: true });
    s = reduce(s, { type: 'FOLLOW', seat: 0, value: true });
    expect(s.phase).toBe('kontra');
    expect(s.kontra).toBe(0); // nema više auto-kontre na pik
    let guard = 0;
    while (s.phase === 'kontra' && guard++ < 6) s = reduce(s, { type: 'PROCEED', seat: currentActor(s)! });
    return s;
  }

  it('„igra pik" bez kontre: refe se piše SVIMA, ruka se ne igra', () => {
    const s = pikNoKontra({ ...cfg, mandatoryKontraOnPik: true, maxRefe: 1 });
    expect(s.phase).toBe('bidding'); // novo deljenje
    expect(s.ledger.refe).toEqual([1, 1, 1]); // refe svima, ne samo nosiocu
    expect(s.declarer).toBeNull();
  });

  it('„igra pik" bez kontre, nosilac drži refe: automatski prolaz se DUPLIRA (−8), refe se odpisuje', () => {
    const s = pikNoKontra({ ...cfg, mandatoryKontraOnPik: true, maxRefe: 1 }, (s) => ({
      ...s,
      ledger: { ...s.ledger, refe: [0, 1, 0] }, // nosilac na maxRefe (drži neodigrani refe)
    }));
    expect(s.phase).not.toBe('playing');
    expect(s.ledger.bule[1]).toBe(30 - 8); // pik prolaz −4, ×2 zbog neodigranog refea
    expect(s.ledger.refe[1]).toBe(0); // refe odigran/odpisan
  });

  it('„igra pik" bez kontre, blokirano tuđim minusom (nosilac bez refea): čist prolaz −4', () => {
    const s = pikNoKontra({ ...cfg, mandatoryKontraOnPik: true, maxRefe: 1 }, (s) => ({
      ...s,
      ledger: { ...s.ledger, bule: [-5, 30, 30] }, // seat 0 u minusu → refe se ne piše
    }));
    expect(s.phase).not.toBe('playing');
    expect(s.ledger.bule[1]).toBe(30 - 4); // nosilac bez refea → bez dupliranja
  });
});
