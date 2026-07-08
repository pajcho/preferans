import type { Suit } from '@engine';

export const SUIT_SYMBOL: Record<Suit, string> = { pik: '♠', karo: '♦', herc: '♥', tref: '♣' };
export const SUIT_LABEL: Record<Suit, string> = { pik: 'Pik', karo: 'Karo', herc: 'Herc', tref: 'Tref' };

/** herc/karo se crtaju crveno */
export function isRedSuit(s: Suit): boolean {
  return s === 'herc' || s === 'karo';
}

/** Nivo licitacije → naziv igre */
export const LEVEL_LABEL: Record<number, string> = {
  2: 'Pik',
  3: 'Karo',
  4: 'Herc',
  5: 'Tref',
  6: 'Betl',
  7: 'Sans',
};
