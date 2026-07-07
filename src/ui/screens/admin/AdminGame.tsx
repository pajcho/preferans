// Admin drill-down jedne partije (/admin/g/:code): meta + igrači (presence),
// obodovane ruke, KOMPLETAN log poteza iz DO storage-a i raw state za debug.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { AdminGameDetail } from '@/protocol/admin'
import type { Seat } from '@engine'
import type { RefeHistoryHand } from '@/history/types'
import { adminApi } from '@net/admin'
import { cn } from '@/lib/utils'
import { GameHistoryHandDetails } from '@ui/components/GameHistoryView'
import { KONTRA_NAME, contractDisplay, describeAction } from './format'
import { replayView, type ReplayView } from './replay'
import {
  AdminShell,
  Panel,
  StatusBadge,
  btnCls,
  fmtDateTime,
  fmtDuration,
  shortId,
  useAdminError,
} from './ui'

const LIVE_REFRESH_MS = 10_000

export default function AdminGame() {
  const { code = '' } = useParams()
  useEffect(() => {
    document.title = `Prefa · Admin · ${code}`
  }, [code])
  return (
    <AdminShell title={`Partija ${code}`}>
      <GameDetail code={code.toUpperCase()} />
    </AdminShell>
  )
}

function GameDetail({ code }: { code: string }) {
  const toError = useAdminError()
  const [detail, setDetail] = useState<AdminGameDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    adminApi.gameDetail(code).then(
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
  }, [code, tick])

  // aktivna partija se sama osvežava — može da se gleda uživo
  const isActive = detail?.game.status === 'active'
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => setTick((t) => t + 1), LIVE_REFRESH_MS)
    return () => clearInterval(id)
  }, [isActive])

  if (error) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="border border-[#9f2f2a] bg-[#ffdede] px-3 py-2 font-bold text-[#9f2f2a]">{error}</p>
      </div>
    )
  }
  if (!detail) return <p className="p-4 text-black/60">Učitavanje...</p>

  const { game, hands, live } = detail
  // jedna rekonstrukcija iz loga za oba panela („Obodovane ruke" refe redovi + „Karte i štihovi")
  const replay = useMemo(() => replayView(detail), [detail])
  const nameBySeat = (seat: Seat | null): string =>
    seat === null ? 'server' : (game.players.find((p) => p.seat === seat)?.displayName ?? `sedište ${seat}`)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackLink />
        <div className="flex items-center gap-2">
          {isActive && <span className="text-[11px] font-bold text-[#087f45]">● uživo (osvežava se)</span>}
          <button onClick={() => setTick((t) => t + 1)} className={cn(btnCls, 'text-[12px]')}>
            Osveži
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetaPanel detail={detail} />
        <PlayersPanel detail={detail} />
      </div>

      <HandsPanel detail={detail} replay={replay} />
      <ReplayPanel detail={detail} replay={replay} />
      <ActionsPanel detail={detail} nameBySeat={nameBySeat} />

      <Panel title="Stanje partije (debug)">
        {live?.state ? (
          <details className="p-3">
            <summary className="cursor-pointer text-[12px] font-bold text-black/60">
              Prikaži pun GameState JSON (neredigovan — sve karte vidljive)
            </summary>
            <pre className="mt-2 max-h-[480px] overflow-auto border border-black/15 bg-white p-2 text-[11px] leading-4">
              {JSON.stringify(live.state, null, 2)}
            </pre>
          </details>
        ) : (
          <p className="p-3 text-[12px] text-black/50">
            {live ? 'Partija još nema stanje (lobi).' : 'Partija nije u DO storage-u (istorijski/seed podatak) — dostupni su samo D1 metapodaci.'}
          </p>
        )}
      </Panel>

      {game.status === 'finished' && hands.length === 0 && (
        <p className="text-[11px] text-black/50">
          Napomena: ruke se beleže od uvođenja analitike — starije partije ih nemaju.
        </p>
      )}
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

function MetaPanel({ detail }: { detail: AdminGameDetail }) {
  const { game, live } = detail
  const rows: [string, React.ReactNode][] = [
    ['Status', <StatusBadge key="s" status={game.status} />],
    ['Kreirana', fmtDateTime(game.createdAt)],
    ['Počela', fmtDateTime(game.startedAt)],
    ['Završena', fmtDateTime(game.finishedAt)],
    ['Trajanje', fmtDuration(game.startedAt, game.finishedAt)],
    ['Ruka', game.handNo || '—'],
    ['Faza', game.phase ?? '—'],
    ['Verzija (br. poteza)', game.version],
  ]
  if (live?.state) rows.push(['Početne bule', live.state.config.startingBule], ['Seed', live.state.seed])
  return (
    <Panel title={`Partija ${game.code}`}>
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

function PlayersPanel({ detail }: { detail: AdminGameDetail }) {
  const navigate = useNavigate()
  const { game, live } = detail
  const connected = new Set(live?.connectedSeats ?? [])
  return (
    <Panel title="Igrači za stolom">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-black/15 text-[11px] text-black/55">
            <th className="px-3 py-1.5">Sedište</th>
            <th className="px-2 py-1.5">Ime</th>
            <th className="px-2 py-1.5">Tip</th>
            <th className="px-2 py-1.5">Online</th>
            <th className="px-2 py-1.5">Rezultat</th>
            <th className="px-2 py-1.5">ID</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => (
            <tr
              key={p.seat}
              onClick={p.userId ? () => navigate(`/admin/p/${p.userId}`) : undefined}
              className={cn(
                'border-b border-black/10 last:border-0',
                p.userId && 'cursor-pointer hover:bg-[#fff2a8]',
              )}
              title={p.userId ? 'Otvori analitiku igrača' : undefined}
            >
              <td className="px-3 py-1.5 font-mono">{p.seat}</td>
              <td className="px-2 py-1.5 font-bold">{p.displayName}</td>
              <td className="px-2 py-1.5">
                {p.isBot ? `🤖 bot (${p.botDifficulty ?? '?'})` : p.registered ? 'čovek · nalog' : 'čovek · anoniman'}
              </td>
              <td className="px-2 py-1.5">
                {p.isBot ? '—' : connected.has(p.seat) ? <span className="font-bold text-[#087f45]">🟢 da</span> : '⚪ ne'}
              </td>
              <td className="px-2 py-1.5 font-mono font-bold">{game.summary ? game.summary.scores[p.seat] : '—'}</td>
              <td className="px-2 py-1.5 font-mono text-[10px] text-black/45" title={p.userId ?? undefined}>
                {shortId(p.userId)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function HandsPanel({ detail, replay }: { detail: AdminGameDetail; replay: ReplayView | null }) {
  // D1 „hands" beleži SAMO odigrane ugovore (refe nema ugovor) — refe (svi „dalje") ruke
  // dopunjujemo iz rekonstrukcije loga da spisak bude kompletan i bez rupa u brojevima ruku.
  type Row =
    | { kind: 'played'; handNo: number; row: AdminGameDetail['hands'][number] }
    | { kind: 'refe'; handNo: number; refeWritten: boolean }
  const refeHands = (replay?.hands ?? []).filter((h): h is RefeHistoryHand => h.kind === 'refe')
  const rows: Row[] = [
    ...detail.hands.map((h) => ({ kind: 'played' as const, handNo: h.handNo, row: h })),
    ...refeHands.map((h) => ({ kind: 'refe' as const, handNo: h.handNo, refeWritten: h.refeWritten })),
  ].sort((a, b) => a.handNo - b.handNo)

  return (
    <Panel title={`Obodovane ruke (${rows.length})`}>
      {rows.length === 0 ? (
        <p className="p-3 text-[12px] text-black/50">Još nema obodovanih ruku.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-black/15 text-[11px] text-black/55">
                <th className="px-3 py-1.5">Ruka</th>
                <th className="px-2 py-1.5">Nosilac</th>
                <th className="px-2 py-1.5">Ugovor</th>
                <th className="px-2 py-1.5">Kontra</th>
                <th className="px-2 py-1.5">Ishod</th>
                <th className="px-2 py-1.5">Vreme</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.kind === 'refe' ? (
                  <tr key={r.handNo} className="border-b border-black/10 text-black/60 last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.handNo}</td>
                    <td className="px-2 py-1.5 italic" colSpan={3}>
                      svi „dalje" — prazna ruka
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={r.refeWritten ? 'font-bold text-[#0b7f3a]' : 'text-black/45'}>
                        {r.refeWritten ? 'refe △' : 'refe (bez upisa)'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5" />
                  </tr>
                ) : (
                  <tr key={r.handNo} className="border-b border-black/10 last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.row.handNo}</td>
                    <td className="px-2 py-1.5 font-bold">{r.row.declarerName}</td>
                    <td className="px-2 py-1.5">{contractDisplay(r.row.contract, r.row.asIgra)}</td>
                    <td className="px-2 py-1.5">{r.row.kontra > 0 ? KONTRA_NAME[r.row.kontra] : '—'}</td>
                    <td className="px-2 py-1.5">
                      {/* passed = nosilac NAPRAVIO ugovor (scoring.ts: declarerTricks>=6 / betl==0) */}
                      {r.row.passed ? (
                        <span className="font-bold text-[#087f45]">prošao</span>
                      ) : (
                        <span className="font-bold text-[#9f2f2a]">pao</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-black/60">{fmtDateTime(r.row.playedAt)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

/**
 * „Karte i štihovi": po ruci — podeljene karte svakog igrača + talon/škart + matrica štihova
 * (ista komponenta kao „Istorija partija" u glavnoj apki). Po defaultu skupljeno; debug panel
 * (pun JSON) ostaje odvojen. Izvor: upisan replay (vs-kompjuter) ili replay loga (online).
 */
function ReplayPanel({ detail, replay }: { detail: AdminGameDetail; replay: ReplayView | null }) {
  return (
    <Panel title="Karte i štihovi">
      {!replay ? (
        <p className="p-3 text-[12px] text-black/50">
          {detail.live
            ? 'Još nema odigranih ruku za prikaz (partija tek počinje).'
            : 'Replay nije dostupan — partija nije u DO storage-u (istorijski/seed podatak).'}
        </p>
      ) : (
        <details className="p-3">
          <summary className="cursor-pointer text-[12px] font-bold text-black/60">
            Prikaži podeljene karte, talon/škart i štihove po ruci ({replay.hands.length})
          </summary>
          <div className="mt-3 space-y-3">
            {replay.hands.map((hand) => (
              <GameHistoryHandDetails
                key={hand.handNo}
                hand={hand}
                playerNames={replay.playerNames}
                humanSeat={replay.humanSeat}
                dense
              />
            ))}
          </div>
        </details>
      )}
    </Panel>
  )
}

function ActionsPanel({
  detail,
  nameBySeat,
}: {
  detail: AdminGameDetail
  nameBySeat: (seat: Seat | null) => string
}) {
  const { live } = detail
  const [handFilter, setHandFilter] = useState<number | 'sve'>('sve')

  const handNos = useMemo(
    () => [...new Set((live?.actions ?? []).map((a) => a.handNo))].sort((a, b) => a - b),
    [live?.actions],
  )
  const actions = useMemo(
    () => (live?.actions ?? []).filter((a) => handFilter === 'sve' || a.handNo === handFilter),
    [live?.actions, handFilter],
  )

  return (
    <Panel
      title={`Potezi (${live?.actions.length ?? 0})`}
      right={
        handNos.length > 1 ? (
          <select
            value={handFilter}
            onChange={(e) => setHandFilter(e.target.value === 'sve' ? 'sve' : Number(e.target.value))}
            className="border border-black/35 bg-white px-1 py-0.5 font-mono text-[11px]"
          >
            <option value="sve">sve ruke</option>
            {handNos.map((h) => (
              <option key={h} value={h}>
                ruka {h}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {!live ? (
        <p className="p-3 text-[12px] text-black/50">
          Log poteza nije dostupan — partija nije u DO storage-u (istorijski/seed podatak).
        </p>
      ) : actions.length === 0 ? (
        <p className="p-3 text-[12px] text-black/50">Još nema poteza.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-[#ececea]">
              <tr className="text-[11px] text-black/55">
                <th className="px-3 py-1.5">#</th>
                <th className="px-2 py-1.5">Ruka</th>
                <th className="px-2 py-1.5">Ko</th>
                <th className="px-2 py-1.5">Potez</th>
                <th className="px-2 py-1.5">Vreme</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.seq} className="border-b border-black/10">
                  <td className="px-3 py-1 font-mono text-black/45">{a.seq}</td>
                  <td className="px-2 py-1 font-mono">{a.handNo}</td>
                  <td className={cn('px-2 py-1 font-bold', a.seat === null && 'font-normal text-black/45 italic')}>
                    {nameBySeat(a.seat)}
                  </td>
                  <td className="px-2 py-1">{describeAction(a.action)}</td>
                  <td className="px-2 py-1 font-mono text-[11px] text-black/60">
                    {new Date(a.at).toLocaleTimeString('sr-Latn-RS', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
