// Admin mini analitika jednog igrača (/admin/p/:userId): profil (nalog ili
// anoniman), agregati (partije/pobede/nosilac), šta igra kao nosilac i SVE
// njegove partije sa drill-down-om. Ulaz: klik na igrača u dashboardu ili
// u detalju partije.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AdminPlayerDetail } from '@/protocol/admin'
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
  fmtDateTime,
  fmtDuration,
  useAdminError,
} from './ui'

export default function AdminPlayer() {
  const { userId = '' } = useParams()
  useEffect(() => {
    document.title = 'Prefa · Admin · Igrač'
  }, [])
  return (
    <AdminShell title="Igrač">
      <PlayerDetail userId={userId} />
    </AdminShell>
  )
}

function PlayerDetail({ userId }: { userId: string }) {
  const toError = useAdminError()
  const [detail, setDetail] = useState<AdminPlayerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    adminApi.playerDetail(userId).then(
      (d) => {
        if (alive) {
          setDetail(d)
          setError(null)
        }
      },
      (e: unknown) => alive && setError(toError(e)),
    )
    return () => {
      alive = false
    }
  }, [userId, tick])

  if (error) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="border border-[#9f2f2a] bg-[#ffdede] px-3 py-2 font-bold text-[#9f2f2a]">{error}</p>
      </div>
    )
  }
  if (!detail) return <p className="p-4 text-black/60">Učitavanje...</p>

  const { player } = detail
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackLink />
        <button onClick={() => setTick((t) => t + 1)} className={cn(btnCls, 'text-[12px]')}>
          Osveži
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['Partije', player.gamesPlayed, ''],
            ['Završene', player.gamesFinished, ''],
            ['Pobede', player.wins, 'text-[#087f45]'],
            ['Nosilac', player.handsDeclared, ''],
          ] as const
        ).map(([label, value, accent]) => (
          <div key={label} className="border border-[#c9c9c9] bg-[#f6f6f2] px-3 py-2 shadow-[2px_3px_0_#4d1008]">
            <div className={cn('font-mono text-2xl font-bold', accent)}>{value}</div>
            <div className="text-[11px] font-bold text-black/55">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfilePanel detail={detail} />
        <ContractsPanel contracts={detail.contracts} />
      </div>

      <GamesPanel detail={detail} />
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/admin" className="font-bold text-white drop-shadow-[1px_1px_0_#4d1008] hover:underline">
      ← Nazad na dashboard
    </Link>
  )
}

function ProfilePanel({ detail }: { detail: AdminPlayerDetail }) {
  const { player } = detail
  const rows: [string, React.ReactNode][] = [
    ['Ime za stolom', <b key="n">{player.displayName}</b>],
    [
      'Nalog',
      player.email ?? <span className="text-black/45">anoniman (bez naloga)</span>,
    ],
    [
      'Lokacija',
      <span key="l">
        {countryFlag(player.country)} {[player.city, player.country].filter(Boolean).join(', ') || '—'}
      </span>,
    ],
    ['Prvi put viđen', fmtDateTime(player.firstSeen)],
    ['Poslednja aktivnost', fmtAgo(player.lastSeen)],
    ['ID', <span key="i" className="break-all font-mono text-[11px] text-black/55">{player.userId}</span>],
  ]
  return (
    <Panel title="Profil">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-black/10 last:border-0">
              <td className="w-44 px-3 py-1.5 font-bold text-black/55">{k}</td>
              <td className="px-2 py-1.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function ContractsPanel({ contracts }: { contracts: AdminPlayerDetail['contracts'] }) {
  const max = Math.max(1, ...contracts.map((c) => c.count))
  return (
    <Panel title="Šta igra kao nosilac">
      {contracts.length === 0 ? (
        <p className="p-3 text-[12px] text-black/50">Još nema obodovanih ruku kao nosilac.</p>
      ) : (
        <div className="space-y-1.5 p-3">
          {contracts.map((c) => {
            // c.passed = broj ruku u kojima je nosilac PROŠAO → padovi su ostatak
            const failPct = c.count > 0 ? Math.round(((c.count - c.passed) / c.count) * 100) : 0
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

function GamesPanel({ detail }: { detail: AdminPlayerDetail }) {
  const navigate = useNavigate()
  const { player, games } = detail
  return (
    <Panel title={`Partije (${games.length}${games.length === 100 ? '+' : ''})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-black/15 text-[11px] text-black/55">
              <th className="px-3 py-1.5">Kod</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Igrači</th>
              <th className="px-2 py-1.5">Ruka</th>
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
                <td className="max-w-[280px] truncate px-2 py-1.5">
                  {g.players.map((p, i) => (
                    <span key={p.seat} className={cn(p.userId === player.userId && 'font-bold')}>
                      {i > 0 && ', '}
                      {p.isBot ? '🤖 ' : ''}
                      {p.displayName}
                    </span>
                  ))}
                </td>
                <td className="px-2 py-1.5">{g.handNo || '—'}</td>
                <td className="px-2 py-1.5 font-mono">{g.summary ? g.summary.scores.join(' : ') : '—'}</td>
                <td className="px-2 py-1.5">{fmtDuration(g.startedAt, g.finishedAt)}</td>
                <td className="px-2 py-1.5 text-black/60">{fmtAgo(g.updatedAt)}</td>
              </tr>
            ))}
            {games.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-black/45">
                  Igrač još nema partija.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
