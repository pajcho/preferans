// ─────────────────────────────────────────────────────────────
// PRIVREMENI dev interfejs (/dev/multi, samo `pnpm dev`): 4 iframe-a = 4 odvojena
// anonimna identiteta (query `?persona=` razdvaja localStorage ključeve — vidi
// net/auth.ts). Služi da se uživo isproba lobi sa više igrača: kreiranje, join,
// pun sto → čekaonica, pa toggle Kompjuter→Igrač = prvi povezani iz reda seda.
//
// Tok: u panelu „Kreator" napravi sto → iskopiraj kod u toolbar → „Otvori svima".
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'

const PANES = [
  { persona: 'demo1', label: 'Kreator' },
  { persona: 'demo2', label: 'Igrač 2' },
  { persona: 'demo3', label: 'Igrač 3' },
  { persona: 'demo4', label: 'Igrač 4' },
]

const base = import.meta.env.BASE_URL

function paneUrl(persona: string, path = '') {
  return `${base}${path}?persona=${persona}`
}

export default function DevMulti() {
  const [code, setCode] = useState('')
  // menjanje ključa remontira iframe → navigacija na nov URL
  const [srcs, setSrcs] = useState(() => PANES.map((p) => paneUrl(p.persona)))

  const openAll = () => {
    const c = code.trim().toUpperCase()
    if (c.length !== 6) return
    setSrcs(PANES.map((p) => paneUrl(p.persona, `o/${c}`)))
  }

  const resetAll = () => {
    setCode('')
    setSrcs(PANES.map((p) => paneUrl(p.persona)))
  }

  return (
    <div className="flex h-dvh flex-col bg-[#3a3a38] font-mono text-sm text-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-black/40 bg-[#222] px-3 py-2">
        <span className="font-bold text-[#f3de33]">DEV · multi-pregled lobija</span>
        <span className="text-white/50">4 iframe-a = 4 identiteta (?persona=)</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="KOD"
            className="w-24 border border-white/30 bg-white px-2 py-1 uppercase tracking-[0.2em] text-black outline-none"
          />
          <button
            onClick={openAll}
            disabled={code.trim().length !== 6}
            className="border border-black/40 bg-[#1597ee] px-3 py-1 font-bold text-black disabled:opacity-40"
          >
            Otvori svima
          </button>
          <button onClick={resetAll} className="border border-white/30 bg-white/10 px-3 py-1 font-bold">
            Reset
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-2 xl:grid-cols-4">
        {PANES.map((p, i) => (
          <div key={p.persona} className="flex min-h-0 flex-col overflow-hidden border border-black/50 bg-[#111]">
            <div className="flex items-center justify-between bg-[#2b2b2a] px-2 py-1 text-[12px]">
              <span className="font-bold">
                {p.label} <span className="text-white/40">({p.persona})</span>
              </span>
              <button
                onClick={() => setSrcs((s) => s.map((v, j) => (j === i ? paneUrl(p.persona) : v)))}
                className="text-white/60 hover:text-white"
                title="Vrati ovaj panel na početnu"
              >
                ⟳ početna
              </button>
            </div>
            <iframe key={srcs[i]} src={srcs[i]} title={p.label} className="min-h-0 w-full flex-1 bg-white" />
          </div>
        ))}
      </div>
    </div>
  )
}
