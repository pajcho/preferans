import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@state/gameStore'
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
  const [diff, setDiff] = useState<Difficulty>('medium')

  function playVsCpu() {
    newGame({ difficulty: diff, startingBule: 40 })
    navigate('/vs')
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center gap-8 p-6 bg-felt text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Preferans</h1>
        <p className="mt-3 text-white/70">Online u troje — ili vežbaj protiv kompjutera.</p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-4">
        <div className="bg-card rounded-2xl p-4">
          <div className="text-sm text-white/70 mb-2">Težina protivnika</div>
          <div className="grid grid-cols-3 gap-2">
            {DIFFS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDiff(d.key)}
                className={cn(
                  'py-2 rounded-lg text-sm font-medium transition',
                  diff === d.key ? 'bg-primary text-primary-foreground' : 'bg-secondary text-white/80',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            onClick={playVsCpu}
            className="mt-4 w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition shadow-lg"
          >
            Igraj protiv kompjutera
          </button>
        </div>

        <button
          disabled
          className="w-full py-3 rounded-xl bg-white/10 text-white/40 font-semibold cursor-not-allowed"
        >
          Online sa drugarima (uskoro)
        </button>
      </div>

      <p className="text-xs text-white/40">v0.1 · vs-kompjuter</p>
    </div>
  )
}
