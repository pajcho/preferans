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

/** iPref-stil: puna širina [leva supa | bule | desna supa] + ukupno (i refe △) ispod. */
export function ScoreBox({ supL, bule, supR, total, refe = 0 }: Props) {
  return (
    <div className="w-full flex flex-col items-center leading-none">
      <div className="flex w-full text-xs font-mono rounded overflow-hidden">
        <span className="flex-1 text-center px-1 py-0.5 bg-black/20 text-white/55">{supL}</span>
        <span className="flex-1 text-center px-1 py-0.5 bg-black/30 font-bold text-white">{bule}</span>
        <span className="flex-1 text-center px-1 py-0.5 bg-black/20 text-white/55">{supR}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className={cn('text-[10px] font-mono', total < 0 ? 'text-emerald-400 font-semibold' : 'text-white/45')}>
          {total}
        </span>
        {refe > 0 && (
          <span className="text-[11px] text-amber-400 font-bold tracking-tight" title={`refe ×${refe}`}>
            {'△'.repeat(refe)}
          </span>
        )}
      </div>
    </div>
  )
}
