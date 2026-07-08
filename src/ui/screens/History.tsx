// Istorija završenih partija — server-backed (lista iz D1 + rekonstrukcija replay-a iz DO loga).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHistoryStore } from '@state/historyStore'
import { hasOnlineEnv } from '@net/config'
import type { HistoryGameItem } from '@/protocol/messages'
import type { GameHistoryRecord } from '@/history/types'
import { cn } from '@/lib/utils'
import { GameHistoryDetail, dateTimeLabel, scoreClass } from '@ui/components/GameHistoryView'

const btnBlue =
  'px-4 py-2 border border-black/35 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'

function isoLabel(iso: string | null): string {
  return iso ? dateTimeLabel(Date.parse(iso)) : '—'
}

/** Pobednik = najniži rezultat (u preferansu je manje bolje). */
function winnerOf(item: HistoryGameItem): { name: string; score: number } | null {
  if (!item.scores) return null
  let best = 0
  for (let s = 1; s < 3; s += 1) if (item.scores[s] < item.scores[best]) best = s
  return {
    name: item.players.find((p) => p.seat === best)?.displayName ?? `Igrač ${best + 1}`,
    score: item.scores[best],
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="min-h-full bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <button onClick={() => navigate('/')} className="relative z-10 font-mono text-sm font-bold text-white/95">
          ← Početna
        </button>
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          Istorija partija
        </div>
      </header>
      {children}
    </div>
  )
}

function Centered({ title, sub }: { title: string; sub: string }) {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-[calc(100dvh-34px)] place-items-center px-4 py-8">
      <div className="w-full max-w-[420px] border border-[#c9c9c9] bg-[#f6f6f2] p-4 text-center font-mono shadow-[4px_5px_0_#4d1008]">
        <h1 className="mb-2 text-xl font-bold">{title}</h1>
        <p className="mb-4 text-sm leading-6 text-black/65">{sub}</p>
        <button onClick={() => navigate('/')} className={btnBlue}>
          Početna
        </button>
      </div>
    </div>
  )
}

export default function History() {
  const navigate = useNavigate()
  const params = useParams()
  const list = useHistoryStore((s) => s.list)
  const loading = useHistoryStore((s) => s.loading)
  const error = useHistoryStore((s) => s.error)
  const loadList = useHistoryStore((s) => s.loadList)
  const loadReplay = useHistoryStore((s) => s.loadReplay)

  const [record, setRecord] = useState<GameHistoryRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    document.title = 'Istorija - Prefa'
    if (hasOnlineEnv()) void loadList()
  }, [loadList])

  const selectedCode = params.id ?? list?.[0]?.code ?? null
  const selectedAbandoned = list?.find((g) => g.code === selectedCode)?.status === 'abandoned'

  // podrazumevano izaberi najskoriju partiju
  useEffect(() => {
    if (!params.id && list && list.length > 0) navigate(`/history/${list[0].code}`, { replace: true })
  }, [navigate, params.id, list])

  // učitaj (i keširaj) replay izabrane partije
  useEffect(() => {
    if (!selectedCode) {
      setRecord(null)
      return
    }
    let alive = true
    setDetailLoading(true)
    void loadReplay(selectedCode).then((r) => {
      if (alive) {
        setRecord(r)
        setDetailLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [selectedCode, loadReplay])

  if (!hasOnlineEnv()) {
    return (
      <Shell>
        <Centered title="Istorija nije dostupna" sub="Za ovaj build nije podešen server, pa nema sačuvanih partija." />
      </Shell>
    )
  }
  if (error && !list) {
    return (
      <Shell>
        <Centered title="Greška" sub={error} />
      </Shell>
    )
  }
  if (list === null || (loading && !list)) {
    return (
      <Shell>
        <Centered title="Učitavanje..." sub="Učitavam tvoje partije sa servera." />
      </Shell>
    )
  }
  if (list.length === 0) {
    return (
      <Shell>
        <Centered
          title="Istorija je prazna"
          sub="Odigraj partiju protiv kompjutera ili online — završene partije se čuvaju ovde."
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-4 px-3 py-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
          <div className="bg-[#ececea] px-3 py-2 text-sm font-bold">Partije ({list.length})</div>
          <div className="max-h-[42vh] overflow-y-auto lg:max-h-[calc(100dvh-112px)]">
            {list.map((item) => {
              const winner = winnerOf(item)
              const active = selectedCode === item.code
              return (
                <button
                  key={item.code}
                  onClick={() => navigate(`/history/${item.code}`)}
                  className={cn(
                    'grid w-full grid-cols-[1fr_auto] gap-2 border-t border-[#d8d2aa] px-3 py-2 text-left text-[12px] leading-5',
                    active ? 'bg-[#fff2a8]' : 'bg-transparent hover:bg-white/45',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{isoLabel(item.finishedAt)}</span>
                    <span className="block truncate text-black/60">
                      {item.handCount} ruka
                      {item.status === 'abandoned' ? ' · prekinuta' : winner ? ` · pobednik ${winner.name}` : ''}
                    </span>
                  </span>
                  {winner ? (
                    <span className={cn('self-center font-bold tabular-nums', scoreClass(winner.score))}>
                      {winner.score}
                    </span>
                  ) : item.status === 'abandoned' ? (
                    <span className="self-center font-bold text-black/45" title="Partija prekinuta">
                      ⚑
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </aside>

        <section className="grid min-w-0 grid-cols-1 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-mono text-2xl font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008]">
              {record ? isoLabel(list.find((g) => g.code === selectedCode)?.finishedAt ?? null) : 'Istorija'}
            </h1>
            <button onClick={() => navigate('/')} className={btnBlue}>
              Nova partija
            </button>
          </div>
          {selectedAbandoned && (
            <div className="border border-[#9b7d1b] bg-[#fff3c4] px-3 py-2 font-mono text-[12px] font-bold text-[#5c4a00] shadow-[2px_3px_0_#4d1008]">
              ⚑ Partija je prekinuta u toku — prikazane su odigrane ruke do prekida (bez konačnog pobednika).
            </div>
          )}
          {detailLoading && !record ? (
            <p className="p-4 font-mono text-sm text-black/60">Učitavanje partije...</p>
          ) : record ? (
            <GameHistoryDetail record={record} />
          ) : (
            <p className="p-4 font-mono text-sm text-black/60">Replay ove partije nije dostupan.</p>
          )}
        </section>
      </main>
    </Shell>
  )
}
