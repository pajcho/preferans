import { cn } from '@/lib/utils';
import type { Card } from '@engine';
import { isRedSuit, SUIT_LABEL, SUIT_SYMBOL } from '@ui/cards';

interface Props {
  card?: Card;
  winner?: boolean;
  className?: string;
}

export function MiniCard({ card, winner, className }: Props) {
  if (!card) {
    return (
      <span
        aria-hidden="true"
        className={cn('block h-[42px] w-[28px] rounded-[4px] border border-black/10 bg-black/[0.035]', className)}
      />
    );
  }

  return (
    <span
      className={cn(
        'grid h-[42px] w-[28px] grid-rows-[1fr_16px] place-items-center rounded-[4px] border border-black/30 bg-[#fffdf4] font-mono font-black leading-none',
        isRedSuit(card.suit) ? 'text-[#d51f17]' : 'text-black',
        winner && 'outline outline-2 outline-[#f3de33]',
        className,
      )}
      aria-label={`${card.rank} ${SUIT_LABEL[card.suit]}`}
      title={`${card.rank}${SUIT_SYMBOL[card.suit]}`}
    >
      <span className={cn('tracking-normal', card.rank === '10' ? 'text-[15px]' : 'text-[21px]')}>{card.rank}</span>
      <span className="text-[15px]">{SUIT_SYMBOL[card.suit]}</span>
    </span>
  );
}
