import type { Contract, BidLevel, Suit, ContractKind } from './types.ts';

/** Osnovna vrednost adutske boje (= nivo u licitaciji). */
export const SUIT_BID_VALUE: Record<Suit, number> = { pik: 2, karo: 3, herc: 4, tref: 5 };

/** Nivo licitacije → podrazumevani tip igre. */
export function levelToContractKind(level: BidLevel): ContractKind {
  switch (level) {
    case 2:
      return { kind: 'suit', trump: 'pik' };
    case 3:
      return { kind: 'suit', trump: 'karo' };
    case 4:
      return { kind: 'suit', trump: 'herc' };
    case 5:
      return { kind: 'suit', trump: 'tref' };
    case 6:
      return { kind: 'betl' };
    case 7:
      return { kind: 'sans' };
    default: {
      const _exhaustive: never = level;
      throw new Error(`nepoznat nivo: ${_exhaustive}`);
    }
  }
}

/** Osnovna vrednost igre (bez "igra" bonusa): pik2..tref5, betl6, sans7. */
export function baseValue(c: Contract): number {
  switch (c.kind) {
    case 'suit':
      return SUIT_BID_VALUE[c.trump];
    case 'betl':
      return 6;
    case 'sans':
      return 7;
    default: {
      const _exhaustive: never = c;
      throw new Error(`nepoznat ugovor: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Vrednost B koja ulazi u bodovanje (+1 za "igra" bez talona). */
export function contractValue(c: Contract): number {
  return baseValue(c) + (c.asGame ? 1 : 0);
}

export function trumpOf(c: Contract): Suit | null {
  return c.kind === 'suit' ? c.trump : null;
}

/** Koliko štihova nosilac mora da uhvati da prođe (betl = 0). */
export function declarerTarget(c: Contract): number {
  return c.kind === 'betl' ? 0 : 6;
}
