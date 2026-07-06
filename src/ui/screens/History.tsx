import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useHistoryStore } from '@state/historyStore'
import { cn } from '@/lib/utils'
import { GameHistoryDetail, dateTimeLabel, scoreClass } from '@ui/components/GameHistoryView'

const btnBlue =
  'px-4 py-2 border border-black/35 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'
const btnDanger =
  'px-4 py-2 border border-black/35 bg-[#e7d0cb] text-[#7b1712] font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'

function EmptyHistory() {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-[calc(100dvh-34px)] place-items-center px-4 py-8">
      <div className="w-full max-w-[420px] border border-[#c9c9c9] bg-[#f6f6f2] p-4 text-center font-mono shadow-[4px_5px_0_#4d1008]">
        <h1 className="mb-2 text-xl font-bold">Istorija je prazna</h1>
        <p className="mb-4 text-sm leading-6 text-black/65">Završene partije protiv kompjutera će se ovde čuvati lokalno.</p>
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
  const records = useHistoryStore((state) => state.records)
  const removeRecord = useHistoryStore((state) => state.removeRecord)
  const clear = useHistoryStore((state) => state.clear)
  const selected = records.find((record) => record.id === params.id) ?? records[0]

  useEffect(() => {
    document.title = 'Istorija - Prefa'
  }, [])

  useEffect(() => {
    if (!params.id && selected) navigate(`/history/${selected.id}`, { replace: true })
    if (params.id && records.length > 0 && !selected) navigate(`/history/${records[0].id}`, { replace: true })
  }, [navigate, params.id, records, selected])

  function deleteSelected() {
    if (!selected) return
    removeRecord(selected.id)
    const next = records.find((record) => record.id !== selected.id)
    navigate(next ? `/history/${next.id}` : '/history', { replace: true })
  }

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

      {records.length === 0 ? (
        <EmptyHistory />
      ) : (
        <main className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-4 px-3 py-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono shadow-[3px_4px_0_#4d1008]">
            <div className="flex items-center justify-between gap-2 bg-[#ececea] px-3 py-2 text-sm font-bold">
              <span>Partije ({records.length})</span>
              <button onClick={clear} className="text-[#9f2f2a]">
                obriši sve
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto lg:max-h-[calc(100dvh-112px)]">
              {records.map((record) => {
                const winner = record.standings[0]
                const active = selected?.id === record.id
                return (
                  <button
                    key={record.id}
                    onClick={() => navigate(`/history/${record.id}`)}
                    className={cn(
                      'grid w-full grid-cols-[1fr_auto] gap-2 border-t border-[#d8d2aa] px-3 py-2 text-left text-[12px] leading-5',
                      active ? 'bg-[#fff2a8]' : 'bg-transparent hover:bg-white/45',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{dateTimeLabel(record.completedAt)}</span>
                      <span className="block truncate text-black/60">
                        {record.handCount} ruka · pobednik {winner.name}
                      </span>
                    </span>
                    <span className={cn('self-center font-bold tabular-nums', scoreClass(winner.score))}>{winner.score}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <section className="grid min-w-0 grid-cols-1 gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-mono text-2xl font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008]">
                {selected ? dateTimeLabel(selected.completedAt) : 'Istorija'}
              </h1>
              <div className="flex gap-2">
                <button onClick={() => navigate('/')} className={btnBlue}>
                  Nova partija
                </button>
                <button onClick={deleteSelected} className={btnDanger}>
                  Obriši
                </button>
              </div>
            </div>
            {selected && <GameHistoryDetail record={selected} />}
          </section>
        </main>
      )}
    </div>
  )
}
