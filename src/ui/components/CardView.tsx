import { cn } from '@/lib/utils';
import type { Card, Rank, Suit } from '@engine';

import back from '@/assets/cards/back.svg';
import aceOfClubs from '@/assets/cards/ace_of_clubs.svg';
import aceOfDiamonds from '@/assets/cards/ace_of_diamonds.svg';
import aceOfHearts from '@/assets/cards/ace_of_hearts.svg';
import aceOfSpades from '@/assets/cards/ace_of_spades.svg';
import jackOfClubs from '@/assets/cards/jack_of_clubs.svg';
import jackOfDiamonds from '@/assets/cards/jack_of_diamonds.svg';
import jackOfHearts from '@/assets/cards/jack_of_hearts.svg';
import jackOfSpades from '@/assets/cards/jack_of_spades.svg';
import kingOfClubs from '@/assets/cards/king_of_clubs.svg';
import kingOfDiamonds from '@/assets/cards/king_of_diamonds.svg';
import kingOfHearts from '@/assets/cards/king_of_hearts.svg';
import kingOfSpades from '@/assets/cards/king_of_spades.svg';
import queenOfClubs from '@/assets/cards/queen_of_clubs.svg';
import queenOfDiamonds from '@/assets/cards/queen_of_diamonds.svg';
import queenOfHearts from '@/assets/cards/queen_of_hearts.svg';
import queenOfSpades from '@/assets/cards/queen_of_spades.svg';
import tenOfClubs from '@/assets/cards/10_of_clubs.svg';
import tenOfDiamonds from '@/assets/cards/10_of_diamonds.svg';
import tenOfHearts from '@/assets/cards/10_of_hearts.svg';
import tenOfSpades from '@/assets/cards/10_of_spades.svg';
import sevenOfClubs from '@/assets/cards/7_of_clubs.svg';
import sevenOfDiamonds from '@/assets/cards/7_of_diamonds.svg';
import sevenOfHearts from '@/assets/cards/7_of_hearts.svg';
import sevenOfSpades from '@/assets/cards/7_of_spades.svg';
import eightOfClubs from '@/assets/cards/8_of_clubs.svg';
import eightOfDiamonds from '@/assets/cards/8_of_diamonds.svg';
import eightOfHearts from '@/assets/cards/8_of_hearts.svg';
import eightOfSpades from '@/assets/cards/8_of_spades.svg';
import nineOfClubs from '@/assets/cards/9_of_clubs.svg';
import nineOfDiamonds from '@/assets/cards/9_of_diamonds.svg';
import nineOfHearts from '@/assets/cards/9_of_hearts.svg';
import nineOfSpades from '@/assets/cards/9_of_spades.svg';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'table';

const CFG: Record<Size, string> = {
  sm: 'w-[28px] h-[42px] rounded-[4px]',
  md: 'w-[44px] h-[64px] rounded-[6px]',
  lg: 'w-[58px] h-[84px] rounded-[7px]',
  xl: 'w-[78px] h-[113px] rounded-[9px]',
  table: 'table-card-size',
};

interface Props {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  dim?: boolean;
  framed?: boolean;
  winner?: boolean;
  onClick?: () => void;
  size?: Size;
}

const SUIT_ASSET: Record<Suit, string> = {
  pik: 'spades',
  herc: 'hearts',
  karo: 'diamonds',
  tref: 'clubs',
};

const RANK_ASSET: Record<Rank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
};

const CARD_IMAGES: Record<string, string> = {
  '7_of_clubs': sevenOfClubs,
  '7_of_diamonds': sevenOfDiamonds,
  '7_of_hearts': sevenOfHearts,
  '7_of_spades': sevenOfSpades,
  '8_of_clubs': eightOfClubs,
  '8_of_diamonds': eightOfDiamonds,
  '8_of_hearts': eightOfHearts,
  '8_of_spades': eightOfSpades,
  '9_of_clubs': nineOfClubs,
  '9_of_diamonds': nineOfDiamonds,
  '9_of_hearts': nineOfHearts,
  '9_of_spades': nineOfSpades,
  '10_of_clubs': tenOfClubs,
  '10_of_diamonds': tenOfDiamonds,
  '10_of_hearts': tenOfHearts,
  '10_of_spades': tenOfSpades,
  ace_of_clubs: aceOfClubs,
  ace_of_diamonds: aceOfDiamonds,
  ace_of_hearts: aceOfHearts,
  ace_of_spades: aceOfSpades,
  jack_of_clubs: jackOfClubs,
  jack_of_diamonds: jackOfDiamonds,
  jack_of_hearts: jackOfHearts,
  jack_of_spades: jackOfSpades,
  queen_of_clubs: queenOfClubs,
  queen_of_diamonds: queenOfDiamonds,
  queen_of_hearts: queenOfHearts,
  queen_of_spades: queenOfSpades,
  king_of_clubs: kingOfClubs,
  king_of_diamonds: kingOfDiamonds,
  king_of_hearts: kingOfHearts,
  king_of_spades: kingOfSpades,
};

function cardImage(card: Card): string {
  return CARD_IMAGES[`${RANK_ASSET[card.rank]}_of_${SUIT_ASSET[card.suit]}`];
}

function cardAlt(card?: Card, faceDown?: boolean): string {
  if (faceDown || !card) return 'poleđina karte';
  return `${card.rank} ${card.suit}`;
}

export function CardView({ card, faceDown, selected, dim, framed, winner, onClick, size = 'md' }: Props) {
  const isBack = faceDown || !card;
  const src = isBack ? back : cardImage(card);
  const base = cn(
    CFG[size],
    'relative overflow-hidden bg-[#fffdf4] shadow-[2px_3px_0_rgba(70,20,14,0.75)] select-none transition',
    framed && 'ring-1 ring-black/25 shadow-[2px_3px_0_rgba(70,20,14,0.78),0_0_0_1px_rgba(255,255,255,0.75)_inset]',
    dim && 'brightness-[1.32] contrast-[0.62] saturate-[0.42]',
    selected && '-translate-y-3 ring-2 ring-primary',
    winner && 'shadow-[2px_3px_0_rgba(70,20,14,0.78),0_0_0_2px_#f3de33,0_0_0_1px_rgba(255,255,255,0.75)_inset]',
  );
  const image = (
    <span className={cn('block h-full w-full bg-[#fffdf4]', !isBack && 'p-[4px]')}>
      <img
        src={src}
        alt={cardAlt(card, faceDown)}
        draggable={false}
        className="h-full w-full rounded-[4px] object-fill"
        loading="eager"
      />
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={dim}
        className={cn(base, 'hover:-translate-y-2 disabled:hover:translate-y-0')}
      >
        {image}
      </button>
    );
  }

  return <div className={base}>{image}</div>;
}
