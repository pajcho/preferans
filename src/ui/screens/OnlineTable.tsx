// Online sto (/o/:code): lobi (podešavanje mesta/pravila + čekaonica) dok kreator
// ne startuje partiju, pa zajednički TableView.
// Server je autoritet — svaki potez ide kroz onlineStore.act (edge funkcija).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Difficulty, Seat, Trip } from '@engine'
import type { GameMeta } from '@/protocol/messages'
import { useOnlineStore } from '@state/onlineStore'
import { hasOnlineEnv } from '@net/config'
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

export default function OnlineTable() {
  const params = useParams<{ code: string }>()
  const navigate = useNavigate()
  const routeCode = (params.code ?? '').toUpperCase()

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
  const leave = useOnlineStore((s) => s.leave)

  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasOnlineEnv() || !routeCode) return
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

  if (!hasOnlineEnv()) {
    return (
      <PageShell>
        <div className="w-full border border-[#c9c9c9] bg-[#f6f6f2] p-5 text-center font-mono text-sm shadow-[3px_4px_0_#4d1008]">
          <p className="mb-4 font-bold">Online igra nije podešena (nedostaje konfiguracija servera).</p>
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
    return (
      <PageShell>
        <Lobby meta={meta} role={role} mySeat={mySeat} presentSeats={presentSeats} routeCode={routeCode} />
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

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Lako' },
  { key: 'medium', label: 'Srednje' },
  { key: 'hard', label: 'Teško' },
]
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'lako', medium: 'srednje', hard: 'teško' }

const toggleCls = (active: boolean) =>
  cn(
    'border border-black/35 px-2 py-1 text-[12px] font-bold shadow-[1px_2px_0_#4d1008] active:translate-y-0.5 active:shadow-[0_0_0_#4d1008]',
    active ? 'bg-[#f3de33] text-black' : 'bg-white text-black/70',
  )

/**
 * Lobi = priprema partije: kreator menja slobodna/bot mesta (toggle Igrač/Kompjuter
 * + težina), podešava bule i refee, pa startuje. Ako je sto pun, novi igrači ulaze
 * u čekaonicu (FIFO) — prvi POVEZANI seda čim se oslobodi mesto.
 */
function Lobby({
  meta,
  role,
  mySeat,
  presentSeats,
  routeCode,
}: {
  meta: GameMeta
  role: 'player' | 'spectator' | null
  mySeat: Seat | null
  presentSeats: Seat[]
  routeCode: string
}) {
  const navigate = useNavigate()
  const displayName = useOnlineStore((s) => s.displayName)
  const setDisplayName = useOnlineStore((s) => s.setDisplayName)
  const joinByCode = useOnlineStore((s) => s.joinByCode)
  const enter = useOnlineStore((s) => s.enter)
  const configure = useOnlineStore((s) => s.configure)
  const start = useOnlineStore((s) => s.start)
  const leaveLobby = useOnlineStore((s) => s.leaveLobby)
  const cancelGame = useOnlineStore((s) => s.cancelGame)
  const leave = useOnlineStore((s) => s.leave)

  const [nameInput, setNameInput] = useState(displayName)
  const [joining, setJoining] = useState(false)
  const [starting, setStarting] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // pravila — lokalni unos, upis na serveru tek na blur/Enter (važi za sve kroz WS push)
  const [buleInput, setBuleInput] = useState(String(meta.startingBule))
  const [refeInput, setRefeInput] = useState(String(meta.maxRefe))
  useEffect(() => setBuleInput(String(meta.startingBule)), [meta.startingBule])
  useEffect(() => setRefeInput(String(meta.maxRefe)), [meta.maxRefe])

  const takenSeats = new Map(meta.players.map((p) => [p.seat, p]))
  const isCreator = meta.youAreCreator
  const freeSeatExists = meta.seats.some((s, i) => s.type === 'human' && !takenSeats.has(i as Seat))
  const allSeatsFilled = ([0, 1, 2] as Seat[]).every((i) => takenSeats.has(i))
  const canJoin = role !== 'player' && meta.yourWaitingPos === null

  const commitRule = (key: 'startingBule' | 'maxRefe', raw: string, min: number, max: number) => {
    const current = key === 'startingBule' ? meta.startingBule : meta.maxRefe
    const n = Number(raw)
    if (Number.isInteger(n) && n >= min && n <= max && n !== current) {
      void configure({ [key]: n })
    } else {
      // nevažeći unos — vrati prikaz na važeću vrednost
      if (key === 'startingBule') setBuleInput(String(meta.startingBule))
      else setRefeInput(String(meta.maxRefe))
    }
  }

  const doJoin = async () => {
    setJoining(true)
    setJoinError(null)
    try {
      setDisplayName(nameInput.trim())
      await joinByCode(routeCode)
      await enter(routeCode)
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Priključivanje nije uspelo')
    } finally {
      setJoining(false)
    }
  }

  const doStart = async () => {
    setStarting(true)
    try {
      await start() // nov (aktivan) view stiže kroz WS push
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
        <div className="flex items-center justify-between bg-[#ececea] px-3 py-2 font-bold">
          <span>Sto {meta.code} — priprema</span>
          <CodeBadgeDark code={meta.code} />
        </div>
        <div className="space-y-2 p-3">
          {([0, 1, 2] as Seat[]).map((seatIdx) => {
            const player = takenSeats.get(seatIdx)
            const cfg = meta.seats[seatIdx]
            const isHuman = !!player && !player.isBot
            const isMe = mySeat === seatIdx
            const editable = isCreator && !isHuman // menja se samo prazno ili bot mesto
            return (
              <div
                key={seatIdx}
                className={cn(
                  'border px-3 py-2',
                  player ? 'border-[#9dbb9d] bg-[#eef6ee]' : 'border-dashed border-black/30 bg-white',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {isHuman
                      ? `${player.displayName}${isMe ? ' (ti)' : ''}`
                      : cfg.type === 'bot'
                        ? `${player?.displayName ?? 'Bot'} 🤖`
                        : 'Slobodno mesto'}
                  </span>
                  <span className="text-[12px] text-black/55">
                    {isHuman
                      ? isMe || presentSeats.includes(seatIdx)
                        ? 'za stolom'
                        : 'nije povezan ⌛'
                      : cfg.type === 'bot'
                        ? `kompjuter (${DIFF_LABEL[cfg.difficulty]})`
                        : 'čeka igrača...'}
                  </span>
                </div>
                {editable && (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <button
                      onClick={() => {
                        if (cfg.type !== 'human') void configure({ seat: seatIdx, seatConfig: { type: 'human' } })
                      }}
                      aria-pressed={cfg.type === 'human'}
                      className={toggleCls(cfg.type === 'human')}
                    >
                      Igrač
                    </button>
                    <button
                      onClick={() => {
                        if (cfg.type !== 'bot')
                          void configure({ seat: seatIdx, seatConfig: { type: 'bot', difficulty: 'medium' } })
                      }}
                      aria-pressed={cfg.type === 'bot'}
                      className={toggleCls(cfg.type === 'bot')}
                    >
                      Kompjuter
                    </button>
                    {cfg.type === 'bot' && (
                      <span className="ml-2 flex gap-1">
                        {DIFFS.map((d) => (
                          <button
                            key={d.key}
                            onClick={() => {
                              if (cfg.difficulty !== d.key)
                                void configure({ seat: seatIdx, seatConfig: { type: 'bot', difficulty: d.key } })
                            }}
                            aria-pressed={cfg.difficulty === d.key}
                            className={toggleCls(cfg.difficulty === d.key)}
                          >
                            {d.label}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* pravila partije */}
          <div className="flex items-center gap-3 border border-black/20 bg-white px-3 py-2">
            <span className="text-[12px] font-bold text-black/60">Pravila:</span>
            {isCreator ? (
              <>
                <label className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold text-black/60">bule</span>
                  <input
                    value={buleInput}
                    onChange={(e) => setBuleInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    onBlur={() => commitRule('startingBule', buleInput, 10, 200)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    inputMode="numeric"
                    aria-label="Bule"
                    className={cn(inputCls, 'w-16 px-2 py-1 text-center')}
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="text-[12px] font-bold text-black/60">refe</span>
                  <input
                    value={refeInput}
                    onChange={(e) => setRefeInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onBlur={() => commitRule('maxRefe', refeInput, 0, 10)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    inputMode="numeric"
                    aria-label="Refe"
                    className={cn(inputCls, 'w-12 px-2 py-1 text-center')}
                  />
                </label>
                <span className="text-[11px] text-black/45">(bule 10–200, refe 0–10)</span>
              </>
            ) : (
              <span className="font-bold">
                bule {meta.startingBule} · refe {meta.maxRefe}
              </span>
            )}
          </div>

          {/* čekaonica */}
          {meta.waiting.length > 0 && (
            <div className="border border-black/20 bg-white px-3 py-2">
              <div className="mb-1 text-[12px] font-bold text-black/60">
                Čekaonica — redosled upada kad se oslobodi mesto
              </div>
              {meta.waiting.map((w, i) => (
                <div key={`${w.displayName}-${i}`} className="flex items-center justify-between py-0.5">
                  <span className="font-bold">
                    {i + 1}. {w.displayName}
                    {meta.yourWaitingPos === i + 1 ? ' (ti)' : ''}
                  </span>
                  <span className="text-[12px] text-black/55">
                    {w.connected ? 'povezan 🟢' : 'nije povezan — preskače se ⚪'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {meta.yourWaitingPos !== null && (
            <div className="border border-[#d8c65c] bg-[#fff9db] px-3 py-2 text-[12px] leading-5">
              <p>
                Čekaš mesto (#{meta.yourWaitingPos} u redu). Čim kreator oslobodi mesto, automatski
                sedaš za sto; ako partija počne pre toga, ostaješ posmatrač.
              </p>
              <button
                onClick={() => void leaveLobby()}
                className={cn(btnPrimary, 'mt-2 w-full text-[#9f2f2a]')}
              >
                Izađi iz reda
              </button>
            </div>
          )}

          <div className="border border-[#d8c65c] bg-[#fff9db] px-3 py-2 text-[12px] leading-5">
            Pošalji drugarima link (dugme gore) ili kod <b>{meta.code}</b> —{' '}
            {isCreator ? 'partija kreće kad klikneš start.' : 'partiju startuje kreator.'}
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
                {joining ? 'Prijavljujem...' : freeSeatExists ? 'Sedi za sto' : 'Stani u red za mesto'}
              </button>
              {joinError && <p className="text-[12px] font-bold text-[#9f2f2a]">{joinError}</p>}
            </div>
          )}

          {isCreator && (
            <button
              onClick={() => void doStart()}
              disabled={!allSeatsFilled || starting}
              className={cn(btnAccent, 'w-full py-3')}
            >
              {starting
                ? 'Delim karte...'
                : allSeatsFilled
                  ? 'Počni partiju ▶'
                  : 'Čekaju se igrači (ili postavi kompjuter)...'}
            </button>
          )}
          {!isCreator && role === 'player' && (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-black/60">
                Sediš za stolom — čeka se da kreator počne partiju.
              </p>
              <button
                onClick={() => void leaveLobby()}
                className={cn(btnPrimary, 'w-full text-[#9f2f2a]')}
                title="Oslobađaš mesto — dobija ga prvi povezani iz čekaonice"
              >
                Ustani od stola
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isCreator && (
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
