// Ljudski (srpski) opisi engine poteza i ugovora za admin drill-down.
import type { ReactNode } from 'react';
import type { BidLevel, Card, Contract } from '@engine';
import type { LoggedAction } from '@/protocol/admin';
import { cn } from '@/lib/utils';

const SUIT_SYM: Record<string, string> = { pik: '♠', karo: '♦', herc: '♥', tref: '♣' };
const RED_SUITS = new Set(['karo', 'herc']);

const LEVEL_NAME: Record<BidLevel, string> = { 2: 'pik', 3: 'karo', 4: 'herc', 5: 'tref', 6: 'betl', 7: 'sans' };
export const KONTRA_NAME = ['—', 'kontra', 'rekontra', 'subkontra', 'mortkontra'] as const;

export function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={cn(
        'inline-block border border-black/25 bg-white px-1 text-[12px] font-bold leading-4',
        RED_SUITS.has(card.suit) ? 'text-[#c02428]' : 'text-black',
      )}
    >
      {SUIT_SYM[card.suit]}
      {card.rank}
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Za D1 hands red: contract je string (pik|karo|herc|tref|betl|sans). */
export function contractDisplay(contract: string, asIgra: boolean): string {
  const symbol = SUIT_SYM[contract] ? `${SUIT_SYM[contract]} ` : '';
  return `${symbol}${capitalize(contract)}${asIgra ? ' (igra)' : ''}`;
}

export function contractName(c: Contract): string {
  const base = c.kind === 'suit' ? `${SUIT_SYM[c.trump]} ${capitalize(c.trump)}` : capitalize(c.kind);
  return c.asGame ? `igra-${base}` : base;
}

/** Jedan potez iz DO loga → čitljiv opis (ko je „rekao šta"). */
export function describeAction(a: LoggedAction): ReactNode {
  switch (a.type) {
    case 'INIT':
      return `podela karata (seed ${a.seed})`;
    case 'PASS':
      return '„dalje"';
    case 'RAISE':
      return `diže na ${a.level} (${LEVEL_NAME[a.level]})`;
    case 'HOLD':
      return '„mogu" (preuzima nivo)';
    case 'IGRA':
      return `„igra" — ${a.level} (${LEVEL_NAME[a.level]})`;
    case 'TAKE_TALON':
      return 'uzima talon';
    case 'ACK_TALON':
      return 'video talon';
    case 'DISCARD':
      return (
        <>
          škarta <CardChip card={a.cards[0]} /> <CardChip card={a.cards[1]} />
        </>
      );
    case 'DECLARE':
      return `objavljuje ${contractName(a.contract)}`;
    case 'FOLLOW':
      return a.value ? '„dođem"' : '„ne dođem"';
    case 'INVITE':
      return 'poziva (idemo zajedno)';
    case 'KONTRA':
      return 'kontra ↑';
    case 'PROCEED':
      return 'nastavlja („može")';
    case 'PLAY':
      return (
        <>
          igra <CardChip card={a.card} />
        </>
      );
    case 'RESOLVE_TRICK':
      return 'štih zatvoren';
    case 'FINALIZE_CLAIM':
      return 'auto-završetak ruke (claim)';
    case 'NEXT_HAND':
      return 'sledeća ruka';
    default:
      return JSON.stringify(a);
  }
}
