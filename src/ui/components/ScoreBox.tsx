import { cn } from '@/lib/utils'

interface Props {
  /** supa protiv levog suseda */
  supL: number
  /** bule (srednja kolona) */
  bule: number
  /** supa protiv desnog suseda */
  supR: number
  /** ukupan rezultat (finalScore); ispod nule = bolje */
  total: number
  /** broj neodigranih refea (△) */
  refe?: number
}

/** Puna širina [leva supa | bule | desna supa] + ukupno (i refe △) ispod. */
export function ScoreBox({ supL, bule, supR, total, refe = 0 }: Props) {
  return (
    <div className="w-full flex flex-col items-center leading-none font-mono">
      <div className="flex w-full overflow-hidden border border-[#5a5a55] bg-[#fffbd4] text-[13px] text-black shadow-[3px_4px_0_#4d1008]">
        <span className="flex-1 text-center px-1 py-0.5 border-r border-[#d8d2aa]">{supL}</span>
        <span className="flex-1 text-center px-1 py-0.5 border-r border-[#d8d2aa] font-bold">{bule}</span>
        <span className="flex-1 text-center px-1 py-0.5">{supR}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1 min-h-[16px]">
        <span className={cn('text-[12px] font-bold', total < 0 ? 'text-[#c7362f]' : 'text-black/75')}>
          {total}
        </span>
        {refe > 0 && (
          <span className="text-[12px] text-[#f3de33] drop-shadow-[1px_1px_0_#4d1008] font-bold tracking-tight" title={`refe ×${refe}`}>
            {'△'.repeat(refe)}
          </span>
        )}
      </div>
    </div>
  )
}
