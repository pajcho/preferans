import { describe, it, expect } from 'vitest';
import {
  newBidding,
  applyPass,
  applyRaise,
  applyHold,
  applyIgra,
  biddingOutcome,
  legalBidOptions,
  firstBidder,
  biddingOrder,
} from '../bidding';

describe('bidding — redosled', () => {
  it('forehand je desno od delioca; redosled kreće od njega', () => {
    expect(firstBidder(0)).toBe(1);
    expect(biddingOrder(0)).toEqual([1, 2, 0]);
    expect(biddingOrder(2)).toEqual([0, 1, 2]);
  });

  it('svi „dalje" → allpass (refe)', () => {
    let b = newBidding(0);
    b = applyPass(b);
    b = applyPass(b);
    b = applyPass(b);
    expect(biddingOutcome(b).status).toBe('allpass');
  });

  it('jedan diže pa dva „dalje" → won na 2', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2);
    b = applyPass(b);
    b = applyPass(b);
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(1);
      expect(o.wonLevel).toBe(2);
      expect(o.igra).toBe(false);
    }
  });

  it('diže se STROGO korak po korak (samo sledeći nivo)', () => {
    let b = newBidding(0);
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 2 });
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'RAISE', level: 3 });
    b = applyRaise(b, 2);
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 3 });
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'RAISE', level: 4 });
  });
});

describe('bidding — „moje"', () => {
  it('nema „moje 2"; posle 2 sledeći igrač mora 3 ili dalje', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2);
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'HOLD' });
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 3 });
    expect(legalBidOptions(b)).toContainEqual({ type: 'PASS' });
  });

  it('posle dizanja na 3 sledeći aktivni igrač može „moje 3" ili dalje, ali ne može 4', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2); // seat1 → 2
    b = applyRaise(b, 3); // seat2 → 3
    expect(b.toAct).toBe(0);
    expect(legalBidOptions(b)).toContainEqual({ type: 'HOLD' });
    expect(legalBidOptions(b)).toContainEqual({ type: 'PASS' });
    expect(legalBidOptions(b)).not.toContainEqual({ type: 'RAISE', level: 4 });
    b = applyHold(b); // seat0 preuzima 3
    b = applyPass(b); // seat1 ne diže → dalje
    b = applyPass(b); // seat2 ne diže → dalje
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(0);
      expect(o.wonLevel).toBe(3);
    }
  });

  it('ako oba druga igrača kažu dalje umesto „moje", dobija aktuelni nosilac', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2); // seat1
    b = applyRaise(b, 3); // seat2
    b = applyPass(b); // seat0 neće moje 3
    b = applyPass(b); // seat1 neće moje 3
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(2);
      expect(o.wonLevel).toBe(3);
    }
  });

  it('primer: 2, 3, moje 3, dalje, 4, moje 4, dalje', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2); // seat1
    b = applyRaise(b, 3); // seat2
    b = applyHold(b); // seat0
    b = applyPass(b); // seat1
    expect(legalBidOptions(b)).toContainEqual({ type: 'RAISE', level: 4 });
    b = applyRaise(b, 4); // seat2
    b = applyHold(b); // seat0
    b = applyPass(b); // seat2 ne diže → dalje
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(0);
      expect(o.wonLevel).toBe(4);
    }
  });

  it('primer: dalje, 2, 3, moje 3, 4, moje 4, dalje', () => {
    let b = newBidding(0);
    b = applyPass(b); // seat1
    b = applyRaise(b, 2); // seat2
    b = applyRaise(b, 3); // seat0
    b = applyHold(b); // seat2
    b = applyRaise(b, 4); // seat0
    b = applyHold(b); // seat2
    b = applyPass(b); // seat0
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(2);
      expect(o.wonLevel).toBe(4);
    }
  });

  it('primer: 2, dalje, 3, moje 3, dalje', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2); // seat1
    b = applyPass(b); // seat2
    b = applyRaise(b, 3); // seat0
    b = applyHold(b); // seat1
    b = applyPass(b); // seat0
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(1);
      expect(o.wonLevel).toBe(3);
    }
  });

  it('„moje 7" odmah završava licitaciju', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2);
    b = applyRaise(b, 3);
    b = applyHold(b);
    b = applyRaise(b, 4);
    b = applyHold(b);
    b = applyRaise(b, 5);
    b = applyHold(b);
    b = applyRaise(b, 6);
    b = applyHold(b);
    b = applyRaise(b, 7);
    expect(biddingOutcome(b).status).toBe('ongoing');
    b = applyHold(b);
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(2);
      expect(o.wonLevel).toBe(7);
    }
  });
});

describe('bidding — „igra" (bez talona)', () => {
  it('na prvom potezu se sme „igra", jača od talona; pobedi kao igra', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2); // seat1 talon-2
    expect(legalBidOptions(b)).toContainEqual({ type: 'IGRA', level: 2 }); // seat2 prvi put
    b = applyIgra(b, 2); // seat2 igra-2
    b = applyPass(b); // seat0 dalje
    b = applyPass(b); // seat1 dalje (talonom ne može preko igre)
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(2);
      expect(o.igra).toBe(true);
    }
  });

  it('u „igra" modu nema talon-raise', () => {
    let b = newBidding(0);
    b = applyRaise(b, 2);
    b = applyIgra(b, 2);
    expect(legalBidOptions(b).some((o) => o.type === 'RAISE')).toBe(false);
  });

  it('„igra" može da se nadigne do igra-betla i igra-sansa', () => {
    let b = newBidding(0);
    b = applyIgra(b, 5);
    expect(legalBidOptions(b)).toContainEqual({ type: 'IGRA', level: 6 });
    b = applyIgra(b, 6);
    expect(legalBidOptions(b)).toContainEqual({ type: 'IGRA', level: 7 });
  });

  it('posle prijavljene „igre" drugi igrač može odmah da kaže konkretnu jaču igru', () => {
    let b = newBidding(0);
    b = applyIgra(b, 2);
    expect(legalBidOptions(b)).toContainEqual({ type: 'IGRA', level: 5 });
    b = applyIgra(b, 5);
    b = applyPass(b);
    b = applyPass(b);
    const o = biddingOutcome(b);
    expect(o.status).toBe('won');
    if (o.status === 'won') {
      expect(o.declarer).toBe(2);
      expect(o.wonLevel).toBe(5);
      expect(o.igra).toBe(true);
    }
  });
});
