// vs-kompjuter sto: gameStore + lokalni bot-runner oko zajedničkog TableView-a.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@state/gameStore'
import { currentActor, chooseAction, activeSeatCount } from '@engine'
import type { Trip } from '@engine'
import { cn } from '@/lib/utils'
import { TableView } from './TableView'

const PLAYER_NAMES: Trip<string> = ['Ti', 'Laza', 'Mika']
const btnPrimary =
  'px-4 py-2 rounded-[3px] border border-black/40 bg-[#f7f7f2] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition disabled:opacity-50'
const btnGhost =
  'px-4 py-2 rounded-[3px] border border-black/35 bg-[#1597ee] text-black font-mono font-bold shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] transition'

export default function Table() {
  const game = useGameStore((s) => s.game)
  const gameStartedAt = useGameStore((s) => s.gameStartedAt)
  const currentGameHands = useGameStore((s) => s.currentGameHands)
  const savedHistoryId = useGameStore((s) => s.savedHistoryId)
  const humanSeat = useGameStore((s) => s.humanSeat)
  const difficulty = useGameStore((s) => s.difficulty)
  const dispatch = useGameStore((s) => s.dispatch)
  const newGame = useGameStore((s) => s.newGame)
  const navigate = useNavigate()

  // bot-runner: zatvori štih posle pauze, pa odigraj botove
  useEffect(() => {
    if (!game || game.phase === 'gameOver') return
    if (game.phase === 'playing' && game.trick && game.trick.cards.length === activeSeatCount(game)) {
      const t = setTimeout(() => dispatch({ type: 'RESOLVE_TRICK' }), 1600)
      return () => clearTimeout(t)
    }
    if (game.phase === 'claim') {
      // forsiran ishod - otkrij karte, prikaži poruku, pa završi ruku
      const t = setTimeout(() => dispatch({ type: 'FINALIZE_CLAIM' }), 3500)
      return () => clearTimeout(t)
    }
    const actor = currentActor(game)
    if (actor !== null && actor !== humanSeat) {
      const t = setTimeout(() => dispatch(chooseAction(game, actor, difficulty)), 800)
      return () => clearTimeout(t)
    }
  }, [game, humanSeat, difficulty, dispatch])

  if (!game) {
    return (
      <div className="min-h-full grid place-items-center bg-felt text-white p-6">
        <div className="text-center">
          <p className="mb-4 text-white/70">Nema aktivne partije.</p>
          <button onClick={() => navigate('/')} className={btnPrimary}>
            Početna
          </button>
        </div>
      </div>
    )
  }

  return (
    <TableView
      game={game}
      humanSeat={humanSeat}
      playerNames={PLAYER_NAMES}
      currentGameHands={currentGameHands}
      gameStartedAt={gameStartedAt}
      dispatch={dispatch}
      onExit={() => navigate('/')}
      savedNote={savedHistoryId ? 'Partija je sačuvana u istoriji.' : 'Čuvanje istorije...'}
      gameOverContent={
        <>
          <button onClick={() => newGame({ difficulty })} className={cn(btnPrimary, 'flex-1')}>
            Nova partija
          </button>
          <button
            onClick={() => navigate(savedHistoryId ? `/history/${savedHistoryId}` : '/history')}
            className={cn(btnPrimary, 'flex-1 bg-[#fff2a8]')}
          >
            Istorija
          </button>
          <button onClick={() => navigate('/')} className={cn(btnGhost, 'flex-1')}>
            Početna
          </button>
        </>
      }
    />
  )
}
