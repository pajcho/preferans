import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@state/gameStore'
import { useHistoryStore } from '@state/historyStore'
import type { Difficulty } from '@engine'
import { cn } from '@/lib/utils'

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Lako' },
  { key: 'medium', label: 'Srednje' },
  { key: 'hard', label: 'Teško' },
]

export default function Home() {
  const navigate = useNavigate()
  const newGame = useGameStore((s) => s.newGame)
  const historyCount = useHistoryStore((s) => s.records.length)
  const [diff, setDiff] = useState<Difficulty>('medium')

  useEffect(() => {
    document.title = 'Prefa'
  }, [])

  function playVsCpu() {
    newGame({ difficulty: diff, startingBule: 40 })
    navigate('/vs')
  }

  return (
    <div className="min-h-full overflow-hidden bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          Prefa
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-34px)] w-full max-w-[980px] place-items-center px-4 py-6">
        <div className="grid w-full max-w-[720px] gap-4 sm:grid-cols-[1fr_260px]">
          <section className="relative border border-[#00572d] bg-[#087f45] shadow-[5px_6px_0_#4d1008]">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_42px),linear-gradient(rgba(255,255,255,0.06)_0_1px,transparent_1px_42px)] opacity-30" />
            <div className="relative flex h-full flex-col justify-between p-5">
              <div>
                <h1 className="font-mono text-[38px] font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008] sm:text-[48px]">
                  Prefa
                </h1>
                <p className="mt-3 max-w-[360px] font-mono text-sm font-bold leading-6 text-white/80">
                  Preferans u troje protiv kompjutera. Srpska pravila, retro sto, brza lokalna partija.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
            <div className="bg-[#ececea] px-3 py-2 font-bold">Nova partija</div>
            <div className="space-y-4 p-3">
              <div>
                <div className="mb-2 font-bold text-[#9f2f2a]">Težina protivnika</div>
                <div className="grid grid-cols-3 gap-2">
                  {DIFFS.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDiff(d.key)}
                      className={cn(
                        'border border-black/35 px-2 py-2 font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]',
                        diff === d.key ? 'bg-[#f3de33] text-black' : 'bg-white text-black/75',
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={playVsCpu}
                className="w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
              >
                Igraj protiv kompjutera
              </button>

              <button
                onClick={() => navigate('/history')}
                className="w-full border border-black/35 bg-[#fff2a8] px-4 py-3 font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
              >
                Istorija partija
              </button>

              <button
                disabled
                className="w-full border border-black/25 bg-[#d8d8d2] px-4 py-3 font-bold text-black/40 shadow-[2px_3px_0_#4d1008]"
              >
                Online sa drugarima
              </button>

              <div className="grid grid-cols-[92px_1fr] gap-y-1 text-[12px] leading-5">
                <span className="font-bold">Režim</span>
                <span className="font-bold text-[#9f2f2a]">vs-kompjuter</span>
                <span className="font-bold">Bule</span>
                <span className="font-bold text-[#9f2f2a]">40</span>
                <span className="font-bold">Status</span>
                <span className="font-bold text-[#9f2f2a]">lokalno</span>
                <span className="font-bold">Istorija</span>
                <span className="font-bold text-[#9f2f2a]">{historyCount}</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
