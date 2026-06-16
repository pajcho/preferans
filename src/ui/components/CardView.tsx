import { cn } from '@/lib/utils'
import { SUIT_SYMBOL, isRedSuit } from '@ui/cards'
import type { Card } from '@engine'

type Size = 'sm' | 'md' | 'lg'

const CFG: Record<Size, { box: string; idx: string; mid: string; radius: string }> = {
  sm: { box: 'w-[30px] h-[44px]', idx: 'text-[8px]', mid: 'text-lg', radius: 'rounded-[3px]' },
  md: { box: 'w-[44px] h-[64px]', idx: 'text-[10px]', mid: 'text-xl', radius: 'rounded-md' },
  lg: { box: 'w-[54px] h-[78px]', idx: 'text-xs', mid: 'text-2xl', radius: 'rounded-md' },
}

interface Props {
  card?: Card
  faceDown?: boolean
  selected?: boolean
  dim?: boolean
  onClick?: () => void
  size?: Size
}

export function CardView({ card, faceDown, selected, dim, onClick, size = 'md' }: Props) {
  const cfg = CFG[size]

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          cfg.box,
          cfg.radius,
          'border border-emerald-950/70 shadow-md bg-felt-dark',
          'bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.06)_3px,rgba(255,255,255,0.06)_6px)]',
        )}
      />
    )
  }

  const red = isRedSuit(card.suit)
  const center = <span className={cn(cfg.mid, 'leading-none')}>{SUIT_SYMBOL[card.suit]}</span>
  // ugaoni indeks: broj GORE, boja ISPOD njega (čitljivije)
  const index = (
    <span className={cn('flex flex-col items-center font-bold leading-[0.95]', cfg.idx)}>
      <span>{card.rank}</span>
      <span>{SUIT_SYMBOL[card.suit]}</span>
    </span>
  )
  const body =
    size === 'sm' ? (
      // mala karta (istorija): rang gore-levo + veća centralna boja, bez ugaonih boja
      <>
        <span className="absolute top-1 left-1 text-[9px] font-bold leading-none">{card.rank}</span>
        {center}
      </>
    ) : (
      <>
        <span className="absolute top-0.5 left-1">{index}</span>
        {center}
        <span className="absolute bottom-0.5 right-1 rotate-180">{index}</span>
      </>
    )
  const base = cn(
    cfg.box,
    cfg.radius,
    'relative shadow-md border flex items-center justify-center select-none transition',
    // disabled karta: NEPROVIDNA svetla pozadina, ali boja ostaje (samo prigušena) — NE grayscale
    dim
      ? cn('bg-[#d9dccf] border-black/5', red ? 'text-suit-red/50' : 'text-suit-black/50')
      : cn('bg-card-face border-black/10', red ? 'text-suit-red' : 'text-suit-black'),
    // selekcija (skart): SAMO podigni kartu — bez z-index skoka da ne prekrije susednu desnu
    selected && '-translate-y-3 ring-2 ring-primary',
  )

  if (onClick) {
    // hover SAMO podiže kartu (bez z-index skoka → ne prekriva susednu kartu desno)
    return (
      <button type="button" onClick={onClick} disabled={dim} className={cn(base, 'hover:-translate-y-2 disabled:hover:translate-y-0')}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}
