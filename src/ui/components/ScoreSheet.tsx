import { cn } from '@/lib/utils'
import type { GameState } from '@engine'

interface Props {
  ledger: GameState['ledger']
  seatName: (s: number) => string
}

/** Bula tablica: srednja kolona (bule) + supe koje je igrač upisao protiv druga dva + refe. */
export function ScoreSheet({ ledger, seatName }: Props) {
  return (
    <div className="bg-card rounded-xl p-3 text-sm">
      <div className="font-semibold mb-2">Bula</div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-white/50 text-xs">
            <th className="text-left font-medium pb-1">Igrač</th>
            <th className="font-medium pb-1">Bule</th>
            <th className="font-medium pb-1">Supe</th>
            <th className="font-medium pb-1">Refe</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((s) => {
            const others = [0, 1, 2].filter((o) => o !== s)
            const supe = others.reduce((sum, o) => sum + ledger.supe[s][o], 0)
            const bule = ledger.bule[s]
            return (
              <tr key={s} className="border-t border-white/10">
                <td className="text-left py-1">{seatName(s)}</td>
                <td
                  className={cn(
                    'text-center font-mono',
                    bule < 0 && 'text-emerald-400',
                    bule > 0 && 'text-destructive',
                  )}
                >
                  {bule}
                </td>
                <td className="text-center font-mono text-white/70">{supe}</td>
                <td className="text-center text-amber-300">{'△'.repeat(ledger.refe[s]) || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
