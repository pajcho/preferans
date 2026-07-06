import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@state/gameStore'
import { useHistoryStore } from '@state/historyStore'
import { useOnlineStore } from '@state/onlineStore'
import { api } from '@net/api'
import { currentUserId } from '@net/auth'
import { hasOnlineEnv } from '@net/config'
import type { Difficulty } from '@engine'
import type { MyGame } from '@/protocol/messages'
import { cn } from '@/lib/utils'

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Lako' },
  { key: 'medium', label: 'Srednje' },
  { key: 'hard', label: 'Teško' },
]

const inputCls =
  'w-full border border-black/35 bg-white px-3 py-2 font-mono text-sm text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)] outline-none focus:border-black/60'

function myGameStatus(g: MyGame): string {
  if (g.status === 'lobby') return 'čeka igrače'
  const turn = g.currentActor !== null && g.currentActor === g.mySeat ? ' · na potezu si!' : ''
  return `ruka ${g.handNo}${turn}`
}

export default function Home() {
  const navigate = useNavigate()
  const newGame = useGameStore((s) => s.newGame)
  const historyCount = useHistoryStore((s) => s.records.length)
  const displayName = useOnlineStore((s) => s.displayName)
  const setDisplayName = useOnlineStore((s) => s.setDisplayName)
  const createGame = useOnlineStore((s) => s.createGame)
  const joinByCode = useOnlineStore((s) => s.joinByCode)

  const [diff, setDiff] = useState<Difficulty>('medium')
  const [name, setName] = useState(displayName)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [myGames, setMyGames] = useState<MyGame[]>([])

  const online = hasOnlineEnv()

  useEffect(() => {
    document.title = 'Prefa'
  }, [])

  useEffect(() => {
    if (!online) return
    let alive = true
    void (async () => {
      try {
        if (!currentUserId()) return // još nema identiteta — nema ni partija
        const games = await api.myGames()
        if (alive) setMyGames(games)
      } catch {
        /* lista je best-effort */
      }
    })()
    return () => {
      alive = false
    }
  }, [online])

  function playVsCpu() {
    newGame({ difficulty: diff, startingBule: 40 })
    navigate('/vs')
  }

  async function createOnline() {
    setOnlineError(null)
    const trimmed = name.trim()
    if (!trimmed) {
      setOnlineError('Unesi ime za online igru')
      return
    }
    setBusy('create')
    try {
      setDisplayName(trimmed)
      const { code } = await createGame()
      navigate(`/o/${code}`)
    } catch (e) {
      setOnlineError(e instanceof Error ? e.message : 'Kreiranje nije uspelo')
    } finally {
      setBusy(null)
    }
  }

  async function joinOnline() {
    setOnlineError(null)
    const trimmed = name.trim()
    const code = joinCode.trim().toUpperCase()
    if (!trimmed) {
      setOnlineError('Unesi ime za online igru')
      return
    }
    if (code.length < 6) {
      setOnlineError('Kod partije ima 6 znakova')
      return
    }
    setBusy('join')
    try {
      setDisplayName(trimmed)
      await joinByCode(code)
      navigate(`/o/${code}`)
    } catch (e) {
      setOnlineError(e instanceof Error ? e.message : 'Priključivanje nije uspelo')
    } finally {
      setBusy(null)
    }
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
                  Preferans u troje — protiv kompjutera ili online sa drugarima.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]">
            <div className="bg-[#ececea] px-3 py-2 font-bold">Protiv kompjutera</div>
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
                Istorija partija ({historyCount})
              </button>
            </div>
          </section>

          <section className="border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008] sm:col-span-2">
            <div className="bg-[#ececea] px-3 py-2 font-bold">Online sa drugarima</div>
            {!online ? (
              <p className="p-3 text-[12px] font-bold text-black/60">
                Online igra još nije podešena za ovaj build (nedostaje konfiguracija servera).
              </p>
            ) : (
              <div className="grid gap-4 p-3 sm:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[12px] font-bold text-black/60">Tvoje ime</div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={20}
                      placeholder="npr. Nikola"
                      className={inputCls}
                    />
                  </div>
                  <button
                    onClick={() => void createOnline()}
                    disabled={busy !== null}
                    className="w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50"
                  >
                    {busy === 'create' ? 'Pravim sto...' : 'Napravi sto'}
                  </button>
                  <p className="text-[11px] leading-4 text-black/50">
                    Dobijaš kod i link za deljenje, pa u lobiju podešavaš mesta (igrač ili
                    kompjuter), bule i refee — partija kreće kad klikneš start.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[12px] font-bold text-black/60">Priključi se kodom</div>
                    <div className="flex gap-2">
                      <input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                        placeholder="NPR2AB"
                        className={cn(inputCls, 'uppercase tracking-[0.2em]')}
                      />
                      <button
                        onClick={() => void joinOnline()}
                        disabled={busy !== null}
                        className="shrink-0 border border-black/40 bg-[#f7f7f2] px-4 font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50"
                      >
                        {busy === 'join' ? '...' : 'Uđi'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 text-[12px] font-bold text-black/60">Moje partije</div>
                    {myGames.length === 0 ? (
                      <p className="text-[12px] text-black/45">Nemaš započetih online partija.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {myGames.slice(0, 5).map((g) => (
                          <button
                            key={g.code}
                            onClick={() => navigate(`/o/${g.code}`)}
                            className="flex w-full items-center justify-between border border-black/25 bg-white px-2 py-1.5 text-left shadow-[1px_2px_0_#4d1008] active:translate-y-0.5"
                          >
                            <span className="font-bold">
                              {g.code}
                              <span className="ml-2 font-normal text-black/55">
                                {g.players
                                  .filter((p) => p.seat !== g.mySeat)
                                  .map((p) => p.displayName)
                                  .join(', ')}
                              </span>
                            </span>
                            <span className="text-[11px] font-bold text-[#9f2f2a]">{myGameStatus(g)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {onlineError && (
                  <p className="text-[12px] font-bold text-[#9f2f2a] sm:col-span-2">{onlineError}</p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
