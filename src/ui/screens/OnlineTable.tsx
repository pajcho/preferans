// Online sto (/o/:code): lobi dok se mesta ne popune, pa zajednički TableView.
// Server je autoritet — svaki potez ide kroz onlineStore.act (edge funkcija).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Seat, Trip } from '@engine'
import { useOnlineStore } from '@state/onlineStore'
import { hasSupabaseEnv } from '@net/supabase'
import { cn } from '@/lib/utils'
import { TableView } from './TableView'

const btnPrimary =
  'px-4 py-2 rounded-[3px] border border-black/40 bg-[#f7f7f2] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition disabled:opacity-50'
const btnAccent =
  'px-4 py-2 rounded-[3px] border border-black/40 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition disabled:opacity-50'
const inputCls =
  'w-full border border-black/35 bg-white px-3 py-2 font-mono text-sm text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)] outline-none focus:border-black/60'

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full overflow-hidden bg-[#92928f] text-black [font-family:Verdana,Geneva,sans-serif]">
      <header className="relative flex h-[34px] items-center border-b border-[#154780] bg-[linear-gradient(#58a8f7,#1767bd_48%,#0c4f9f)] px-2 text-white shadow-[0_2px_0_rgba(255,255,255,0.35)_inset]">
        <div className="pointer-events-none absolute inset-x-12 text-center font-mono text-sm font-bold drop-shadow">
          Prefa · online
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100dvh-34px)] w-full max-w-[640px] place-items-center px-4 py-6">
        {children}
      </main>
    </div>
  )
}

function CodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/o/${code}`
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(link).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="rounded-[2px] bg-white/15 px-2 py-1 font-mono text-[12px] font-bold text-white/95"
      title="Kopiraj link za priključivanje"
    >
      {copied ? 'Kopirano ✓' : `KOD ${code} ⧉`}
    </button>
  )
}

export default function OnlineTable() {
  const params = useParams<{ code: string }>()
  const navigate = useNavigate()
  const routeCode = (params.code ?? '').toUpperCase()

  const displayName = useOnlineStore((s) => s.displayName)
  const setDisplayName = useOnlineStore((s) => s.setDisplayName)
  const meta = useOnlineStore((s) => s.meta)
  const state = useOnlineStore((s) => s.state)
  const role = useOnlineStore((s) => s.role)
  const mySeat = useOnlineStore((s) => s.mySeat)
  const hands = useOnlineStore((s) => s.hands)
  const presentSeats = useOnlineStore((s) => s.presentSeats)
  const pendingAction = useOnlineStore((s) => s.pendingAction)
  const storeError = useOnlineStore((s) => s.error)
  const clearError = useOnlineStore((s) => s.clearError)
  const enter = useOnlineStore((s) => s.enter)
  const act = useOnlineStore((s) => s.act)
  const joinByCode = useOnlineStore((s) => s.joinByCode)
  const cancelGame = useOnlineStore((s) => s.cancelGame)
  const leave = useOnlineStore((s) => s.leave)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState(displayName)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!hasSupabaseEnv() || !routeCode) return
    let alive = true
    enter(routeCode).catch((e) => {
      if (alive) setLoadError(e instanceof Error ? e.message : 'Greška pri učitavanju partije')
    })
    return () => {
      alive = false
    }
  }, [routeCode, enter])

  const playerNames = useMemo<Trip<string>>(() => {
    const names: Trip<string> = ['?', '?', '?']
    if (meta) {
      for (const p of meta.players) names[p.seat] = p.seat === mySeat ? 'Ti' : p.displayName
    }
    return names
  }, [meta, mySeat])

  const offlineSeats = useMemo<Seat[]>(() => {
    if (!meta || meta.status !== 'active') return []
    return meta.players
      .filter((p) => !p.isBot && p.seat !== mySeat && !presentSeats.includes(p.seat))
      .map((p) => p.seat)
  }, [meta, presentSeats, mySeat])

  if (!hasSupabaseEnv()) {
    return (
      <PageShell>
        <div className="w-full border border-[#c9c9c9] bg-[#f6f6f2] p-5 text-center font-mono text-sm shadow-[3px_4px_0_#4d1008]">
          <p className="mb-4 font-bold">Online igra nije podešena (nedostaje Supabase konfiguracija).</p>
          <button onClick={() => navigate('/')} className={btnPrimary}>
            Početna
          </button>
        </div>
      </PageShell>
    )
  }

  if (loadError) {
    return (
      <PageShell>
        <div className="w-full border border-[#c9c9c9] bg-[#f6f6f2] p-5 text-center font-mono text-sm shadow-[3px_4px_0_#4d1008]">
          <p className="mb-2 font-bold text-[#9f2f2a]">{loadError}</p>
          <p className="mb-4 text-black/60">Proveri kod partije ({routeCode}) pa pokušaj ponovo.</p>
          <button onClick={() => navigate('/')} className={btnPrimary}>
            Početna
          </button>
        </div>
      </PageShell>
    )
  }

  if (!meta) {
    return (
      <PageShell>
        <div className="font-mono text-sm font-bold text-black/70">Učitavanje partije {routeCode}...</div>
      </PageShell>
    )
  }

  if (meta.status === 'abandoned') {
    return (
      <PageShell>
        <div className="w-full border border-[#c9c9c9] bg-[#f6f6f2] p-5 text-center font-mono text-sm shadow-[3px_4px_0_#4d1008]">
          <p className="mb-4 font-bold">Partija {meta.code} je otkazana.</p>
          <button onClick={() => navigate('/')} className={btnPrimary}>
            Početna
          </button>
        </div>
      </PageShell>
    )
  }

  // ─── LOBI ───
  if (meta.status === 'lobby') {
    const takenSeats = new Map(meta.players.map((p) => [p.seat, p]))
    const canJoin = role !== 'player' && meta.seats.some((s, i) => s.type === 'human' && !takenSeats.has(i as Seat))

    const doJoin = async () => {
      setJoining(true)
      try {
        setDisplayName(nameInput.trim())
        await joinByCode(routeCode)
        await enter(routeCode)
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Priključivanje nije uspelo')
      } finally {
        setJoining(false)
      }
    }

    return (
      <PageShell>
        <div className="w-full space-y-4">
          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
            <div className="flex items-center justify-between bg-[#ececea] px-3 py-2 font-bold">
              <span>Sto {meta.code} — čekanje igrača</span>
              <CodeBadgeDark code={meta.code} />
            </div>
            <div className="space-y-2 p-3">
              {([0, 1, 2] as Seat[]).map((seatIdx) => {
                const player = takenSeats.get(seatIdx)
                const cfg = meta.seats[seatIdx]
                return (
                  <div
                    key={seatIdx}
                    className={cn(
                      'flex items-center justify-between border px-3 py-2',
                      player ? 'border-[#9dbb9d] bg-[#eef6ee]' : 'border-dashed border-black/30 bg-white',
                    )}
                  >
                    <span className="font-bold">
                      {player
                        ? `${player.displayName}${player.seat === mySeat ? ' (ti)' : ''}`
                        : cfg.type === 'bot'
                          ? 'Bot'
                          : 'Slobodno mesto'}
                      {player?.isBot ? ' 🤖' : ''}
                    </span>
                    <span className="text-[12px] text-black/55">
                      {player
                        ? player.isBot
                          ? `kompjuter (${{ easy: 'lako', medium: 'srednje', hard: 'teško' }[(cfg.type === 'bot' && cfg.difficulty) || 'medium']})`
                          : 'spreman'
                        : 'čeka igrača...'}
                    </span>
                  </div>
                )
              })}

              <div className="border border-[#d8c65c] bg-[#fff9db] px-3 py-2 text-[12px] leading-5">
                Pošalji drugarima link (dugme gore) ili kod <b>{meta.code}</b> — partija počinje čim se
                popune sva mesta.
              </div>

              {canJoin && (
                <div className="space-y-2 border-t border-black/10 pt-3">
                  <label className="block text-[12px] font-bold text-black/60">Tvoje ime</label>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={20}
                    placeholder="npr. Žika"
                    className={inputCls}
                  />
                  <button
                    onClick={() => void doJoin()}
                    disabled={joining || nameInput.trim().length === 0}
                    className={cn(btnAccent, 'w-full')}
                  >
                    {joining ? 'Sedam za sto...' : 'Sedi za sto'}
                  </button>
                </div>
              )}
              {role !== 'player' && !canJoin && (
                <p className="text-[12px] font-bold text-black/60">
                  Sva mesta su popunjena — ostaješ kao posmatrač.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                {meta.youAreCreator && (
                  <button
                    onClick={() => {
                      void cancelGame().then(() => {
                        leave()
                        navigate('/')
                      })
                    }}
                    className={cn(btnPrimary, 'flex-1 text-[#9f2f2a]')}
                  >
                    Otkaži partiju
                  </button>
                )}
                <button
                  onClick={() => navigate('/')}
                  className={cn(btnPrimary, 'flex-1')}
                  title="Partija ostaje — možeš se vratiti preko koda"
                >
                  Početna
                </button>
              </div>
            </div>
          </section>
        </div>
      </PageShell>
    )
  }

  // ─── STO (active/finished) ───
  if (!state) {
    return (
      <PageShell>
        <div className="font-mono text-sm font-bold text-black/70">Učitavanje stola...</div>
      </PageShell>
    )
  }

  const startedAtMs = meta.startedAt ? new Date(meta.startedAt).getTime() : null

  return (
    <>
      <TableView
        game={state}
        humanSeat={mySeat ?? 0}
        playerNames={playerNames}
        currentGameHands={hands}
        gameStartedAt={startedAtMs}
        dispatch={(a) => void act(a)}
        onExit={() => {
          leave()
          navigate('/')
        }}
        readOnly={role === 'spectator'}
        actionsDisabled={pendingAction}
        offlineSeats={offlineSeats}
        headerExtra={<CodeBadge code={meta.code} />}
        savedNote={`Partija je sačuvana na serveru (kod ${meta.code}).`}
        gameOverContent={
          <>
            <button
              onClick={() => {
                leave()
                navigate('/')
              }}
              className={cn(btnAccent, 'flex-1 sm:col-span-3')}
            >
              Početna
            </button>
          </>
        }
      />
      {role === 'spectator' && (
        <div className="pointer-events-none fixed bottom-10 left-1/2 z-40 -translate-x-1/2 border border-[#77735f] bg-[#fffbd2] px-3 py-1 font-mono text-[12px] font-bold text-black shadow-[2px_3px_0_#4d1008] lg:bottom-2">
          Posmatraš partiju 👁
        </div>
      )}
      {storeError && (
        <button
          onClick={clearError}
          className="fixed left-1/2 top-10 z-50 -translate-x-1/2 border border-[#9f2f2a] bg-[#ffe5e3] px-3 py-1 font-mono text-[12px] font-bold text-[#9f2f2a] shadow-[2px_3px_0_#4d1008]"
        >
          {storeError} ✕
        </button>
      )}
    </>
  )
}

/** Varijanta CodeBadge-a za svetlu pozadinu lobija. */
function CodeBadgeDark({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/o/${code}`
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(link).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className="border border-black/30 bg-white px-2 py-0.5 font-mono text-[12px] font-bold text-black shadow-[1px_2px_0_#4d1008]"
      title="Kopiraj link za priključivanje"
    >
      {copied ? 'Kopirano ✓' : 'Kopiraj link ⧉'}
    </button>
  )
}
