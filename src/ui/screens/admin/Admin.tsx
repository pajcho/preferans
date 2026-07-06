// Interni admin dashboard (/admin): korišćenje, aktivnost, „šta se igra",
// igrači sa lokacijama i lista partija sa drill-down-om. Podaci: /api/admin/*.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AdminGameListItem, AdminPlayersResponse, AdminStats } from '@/protocol/admin'
import type { GameStatus } from '@/protocol/messages'
import { adminApi } from '@net/admin'
import { cn } from '@/lib/utils'
import { contractDisplay } from './format'
import {
  AdminShell,
  Panel,
  StatusBadge,
  btnCls,
  countryFlag,
  fmtAgo,
  fmtDuration,
  fmtTime,
  inputCls,
  shortId,
  useAdminError,
} from './ui'

const REFRESH_MS = 30_000
const GAMES_PAGE = 15
const PLAYERS_PAGE = 12

export default function Admin() {
  useEffect(() => {
    document.title = 'Prefa · Admin'
  }, [])
  return (
    <AdminShell title="Prefa · Admin">
      <Dashboard />
    </AdminShell>
  )
}

function Dashboard() {
  const toError = useAdminError()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  // tick tera i statistiku i tabele na periodično osvežavanje
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true
    adminApi.stats().then(
      (s) => {
        if (alive) {
          setStats(s)
          setError(null)
        }
      },
      (e: unknown) => alive && setError(toError(e)),
    )
    return () => {
      alive = false
    }
  }, [tick])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold text-white drop-shadow-[1px_1px_0_#4d1008]">
          Statistika korišćenja
        </h1>
        <div className="flex items-center gap-2 text-[11px] text-black/60">
          {stats && <span>osveženo {fmtTime(stats.generatedAt)}</span>}
          <button onClick={() => setTick((t) => t + 1)} className={cn(btnCls, 'text-[12px]')}>
            Osveži
          </button>
        </div>
      </div>

      {error && <p className="border border-[#9f2f2a] bg-[#ffdede] px-3 py-2 font-bold text-[#9f2f2a]">{error}</p>}

      {stats && (
        <>
          <StatCards stats={stats} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ActivityChart daily={stats.daily} />
            <ContractsPanel contracts={stats.contracts} />
          </div>
        </>
      )}

      <GamesPanel tick={tick} />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <PlayersPanel tick={tick} />
        {stats && <CountriesPanel countries={stats.countries} />}
      </div>
    </div>
  )
}

// ── kartice sa ukupnim brojkama ──

function StatCards({ stats }: { stats: AdminStats }) {
  const t = stats.totals
  const cards: { label: string; value: number; accent?: string; live?: boolean }[] = [
    { label: 'Partije ukupno', value: t.games },
    { label: 'Aktivne sada', value: t.activeNow, accent: 'text-[#087f45]', live: t.activeNow > 0 },
    { label: 'Završene', value: t.byStatus.finished },
    { label: 'U lobiju', value: t.byStatus.lobby },
    { label: 'Otkazane', value: t.byStatus.abandoned },
    { label: 'Igrači', value: t.players },
    { label: 'Sa nalogom', value: t.registered, accent: 'text-[#1767bd]' },
    { label: 'Odigrane ruke', value: t.hands },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((c) => (
        <div key={c.label} className="border border-[#c9c9c9] bg-[#f6f6f2] px-3 py-2 shadow-[2px_3px_0_#4d1008]">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('font-mono text-2xl font-bold', c.accent)}>{c.value}</span>
            {c.live && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#087f45]" />}
          </div>
          <div className="text-[11px] font-bold text-black/55">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── aktivnost poslednjih 30 dana (kreirane / završene po danu) ──

function ActivityChart({ daily }: { daily: AdminStats['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => Math.max(d.created, d.finished)))
  return (
    <Panel
      title="Aktivnost (30 dana)"
      right={
        <span className="text-[11px] text-black/55">
          <span className="mr-2 inline-block h-2 w-2 bg-[#1597ee]" /> kreirane
          <span className="ml-3 mr-2 inline-block h-2 w-2 bg-[#087f45]" /> završene
        </span>
      }
    >
      <div className="p-3">
        <div className="flex h-28 gap-[3px]">
          {daily.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.created} kreirano, ${d.finished} završeno`}
              className="flex h-full flex-1 items-end gap-[1px]"
            >
              <div className="flex-1 bg-[#1597ee]" style={{ height: `${(d.created / max) * 100}%` }} />
              <div className="flex-1 bg-[#087f45]" style={{ height: `${(d.finished / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-black/45">
          <span>{daily[0]?.date}</span>
          <span>{daily[daily.length - 1]?.date}</span>
        </div>
      </div>
    </Panel>
  )
}

// ── šta se najviše igra ──

function ContractsPanel({ contracts }: { contracts: AdminStats['contracts'] }) {
  const max = Math.max(1, ...contracts.map((c) => c.count))
  return (
    <Panel title="Šta se igra (obodovane ruke)">
      {contracts.length === 0 ? (
        <p className="p-3 text-[12px] text-black/50">Još nema obodovanih ruku.</p>
      ) : (
        <div className="space-y-1.5 p-3">
          {contracts.map((c) => {
            const failPct = c.count > 0 ? Math.round((c.passed / c.count) * 100) : 0
            return (
              <div key={`${c.contract}-${c.asIgra ? 'igra' : 'talon'}`} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[12px] font-bold">
                  {contractDisplay(c.contract, c.asIgra)}
                </span>
                <div className="h-4 flex-1 bg-black/10">
                  <div className="h-full bg-[#f3de33]" style={{ width: `${(c.count / max) * 100}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-[11px]">
                  <b>{c.count}</b>
                  <span className="text-black/50"> · pad {failPct}%</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// ── partije (filter + pretraga + drill-down) ──

const STATUS_TABS: { key: GameStatus | ''; label: string }[] = [
  { key: '', label: 'Sve' },
  { key: 'active', label: 'Aktivne' },
  { key: 'lobby', label: 'Lobi' },
  { key: 'finished', label: 'Završene' },
  { key: 'abandoned', label: 'Otkazane' },
]

function GamesPanel({ tick }: { tick: number }) {
  const navigate = useNavigate()
  const toError = useAdminError()
  const [status, setStatus] = useState<GameStatus | ''>('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [games, setGames] = useState<AdminGameListItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    adminApi.games({ status, q: search, limit: GAMES_PAGE, offset: page * GAMES_PAGE }).then(
      (res) => {
        if (alive) {
          setGames(res.games)
          setTotal(res.total)
          setError(null)
        }
      },
      (e: unknown) => alive && setError(toError(e)),
    )
    return () => {
      alive = false
    }
  }, [status, search, page, tick])

  const pages = Math.max(1, Math.ceil(total / GAMES_PAGE))

  return (
    <Panel
      title={`Partije (${total})`}
      right={
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setStatus(t.key)
                setPage(0)
              }}
              className={cn(
                'border border-black/30 px-2 py-0.5 text-[11px] font-bold',
                status === t.key ? 'bg-[#f3de33]' : 'bg-white text-black/60',
              )}
            >
              {t.label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(q.trim())
                setPage(0)
              }
            }}
            placeholder="kod / ime / userId ⏎"
            className={cn(inputCls, 'w-40 py-0.5 text-[11px] max-sm:w-full')}
          />
        </div>
      }
    >
      {error && <p className="px-3 py-2 font-bold text-[#9f2f2a]">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-black/15 text-[11px] text-black/55">
              <th className="px-3 py-1.5">Kod</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Igrači</th>
              <th className="px-2 py-1.5">Ruka</th>
              <th className="px-2 py-1.5">Faza</th>
              <th className="px-2 py-1.5">Rezultat</th>
              <th className="px-2 py-1.5">Trajanje</th>
              <th className="px-2 py-1.5">Promena</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr
                key={g.code}
                onClick={() => navigate(`/admin/g/${g.code}`)}
                className="cursor-pointer border-b border-black/10 hover:bg-[#fff2a8]"
              >
                <td className="px-3 py-1.5 font-bold">{g.code}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={g.status} />
                </td>
                <td className="max-w-[260px] truncate px-2 py-1.5">
                  {g.players.map((p) => `${p.isBot ? '🤖 ' : ''}${p.displayName}`).join(', ')}
                </td>
                <td className="px-2 py-1.5">{g.handNo || '—'}</td>
                <td className="px-2 py-1.5">{g.phase ?? '—'}</td>
                <td className="px-2 py-1.5 font-mono">{g.summary ? g.summary.scores.join(' : ') : '—'}</td>
                <td className="px-2 py-1.5">{fmtDuration(g.startedAt, g.finishedAt)}</td>
                <td className="px-2 py-1.5 text-black/60">{fmtAgo(g.updatedAt)}</td>
              </tr>
            ))}
            {games.length === 0 && !error && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-black/45">
                  Nema partija za izabrani filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-black/10 px-3 py-2 text-[11px]">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={cn(btnCls, 'py-0.5 text-[11px]')}>
            ← Prethodna
          </button>
          <span>
            str. {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            className={cn(btnCls, 'py-0.5 text-[11px]')}
          >
            Sledeća →
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── igrači ──

function PlayersPanel({ tick }: { tick: number }) {
  const toError = useAdminError()
  const [page, setPage] = useState(0)
  const [data, setData] = useState<AdminPlayersResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    adminApi.players({ limit: PLAYERS_PAGE, offset: page * PLAYERS_PAGE }).then(
      (res) => {
        if (alive) {
          setData(res)
          setError(null)
        }
      },
      (e: unknown) => alive && setError(toError(e)),
    )
    return () => {
      alive = false
    }
  }, [page, tick])

  const pages = data ? Math.max(1, Math.ceil(data.total / PLAYERS_PAGE)) : 1

  const players = data?.players ?? []

  return (
    <Panel title={`Igrači${data ? ` (${data.total})` : ''} — ko najviše igra`}>
      {error && <p className="px-3 py-2 font-bold text-[#9f2f2a]">{error}</p>}
      {data && players.length === 0 && (
        <p className="px-3 py-4 text-center text-[12px] text-black/45">Još nema registrovanih igrača.</p>
      )}

      {/* ≥sm: tabela */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-black/15 text-[11px] text-black/55">
              <th className="px-3 py-1.5">#</th>
              <th className="px-2 py-1.5">Ime</th>
              <th className="px-2 py-1.5">Nalog</th>
              <th className="px-2 py-1.5">Lokacija</th>
              <th className="px-2 py-1.5 text-right">Partije</th>
              <th className="px-2 py-1.5 text-right">Završene</th>
              <th className="px-2 py-1.5 text-right">Pobede</th>
              <th className="px-2 py-1.5 text-right">Nosilac</th>
              <th className="px-2 py-1.5">Aktivan</th>
              <th className="px-2 py-1.5">ID</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.userId} className="border-b border-black/10">
                <td className="px-3 py-1.5 text-black/45">{page * PLAYERS_PAGE + i + 1}</td>
                <td className="px-2 py-1.5 font-bold">{p.displayName}</td>
                <td className="max-w-[180px] truncate px-2 py-1.5" title={p.email ?? undefined}>
                  {p.email ?? <span className="text-black/40">anoniman</span>}
                </td>
                <td className="px-2 py-1.5">
                  {countryFlag(p.country)} {p.city ?? p.country ?? '—'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{p.gamesPlayed}</td>
                <td className="px-2 py-1.5 text-right font-mono">{p.gamesFinished}</td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-[#087f45]">{p.wins}</td>
                <td className="px-2 py-1.5 text-right font-mono">{p.handsDeclared}</td>
                <td className="px-2 py-1.5 text-black/60">{fmtAgo(p.lastSeen)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-black/45" title={p.userId}>
                  {shortId(p.userId)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* <sm: kartice sa SVIM podacima */}
      <div className="divide-y divide-black/10 sm:hidden">
        {players.map((p, i) => (
          <div key={p.userId} className="space-y-1.5 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-bold">
                <span className="mr-1.5 font-normal text-black/45">{page * PLAYERS_PAGE + i + 1}.</span>
                {p.displayName}
              </span>
              <span className="shrink-0 text-[11px]">
                {countryFlag(p.country)} {p.city ?? p.country ?? '—'}
              </span>
            </div>
            <div className="truncate text-[11px] text-black/50">{p.email ?? 'anoniman'}</div>
            <div className="grid grid-cols-4 gap-1 text-center">
              {(
                [
                  ['Partije', p.gamesPlayed],
                  ['Završene', p.gamesFinished],
                  ['Pobede', p.wins],
                  ['Nosilac', p.handsDeclared],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="border border-black/15 bg-white px-1 py-0.5">
                  <div className={cn('font-mono text-[13px] font-bold', label === 'Pobede' && 'text-[#087f45]')}>
                    {value}
                  </div>
                  <div className="text-[10px] text-black/50">{label}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-black/50">
              <span>aktivan {fmtAgo(p.lastSeen)}</span>
              <span className="font-mono" title={p.userId}>
                ID {shortId(p.userId)}
              </span>
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-black/10 px-3 py-2 text-[11px]">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={cn(btnCls, 'py-0.5 text-[11px]')}>
            ← Prethodna
          </button>
          <span>
            str. {page + 1} / {pages}
          </span>
          <button
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => p + 1)}
            className={cn(btnCls, 'py-0.5 text-[11px]')}
          >
            Sledeća →
          </button>
        </div>
      )}
    </Panel>
  )
}

// ── lokacije ──

function CountriesPanel({ countries }: { countries: AdminStats['countries'] }) {
  const max = useMemo(() => Math.max(1, ...countries.map((c) => c.players)), [countries])
  return (
    <Panel title="Lokacije igrača">
      {countries.length === 0 ? (
        <p className="p-3 text-[12px] text-black/50">Još nema podataka o lokacijama.</p>
      ) : (
        <div className="space-y-1.5 p-3">
          {countries.map((c) => (
            <div key={c.country ?? 'nepoznato'} className="flex items-center gap-2 text-[12px]">
              <span className="w-16 shrink-0 font-bold">
                {countryFlag(c.country)} {c.country ?? '—'}
              </span>
              <div className="h-4 flex-1 bg-black/10">
                <div className="h-full bg-[#1597ee]" style={{ width: `${(c.players / max) * 100}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right font-mono font-bold">{c.players}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
