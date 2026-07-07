import { finalScore } from '@engine'
import type { Card, GameState, Seat, Trip } from '@engine'
import {
  GAME_HISTORY_SCHEMA_VERSION,
  type CompletedHandSource,
  type GameHistoryHand,
  type GameHistoryInput,
  type GameHistoryRecord,
  type GameHistoryStanding,
} from './types'

function scoreForSeat(game: GameState, seat: Seat): number {
  const others = ([0, 1, 2] as Seat[]).filter((other) => other !== seat)
  const supaFor = others.reduce<number>((sum, other) => sum + game.ledger.supe[seat][other], 0)
  const supaAgainst = others.reduce<number>((sum, other) => sum + game.ledger.supe[other][seat], 0)
  return finalScore(game.ledger.bule[seat], supaFor, supaAgainst)
}

function rankStandings(rows: Array<Omit<GameHistoryStanding, 'rank'>>): GameHistoryStanding[] {
  let previousScore: number | null = null
  let previousRank = 0
  return rows
    .sort((a, b) => a.score - b.score)
    .map((row, index) => {
      const rank = previousScore === row.score ? previousRank : index + 1
      previousScore = row.score
      previousRank = rank
      return { ...row, rank }
    })
}

export function completedHandFromGame(game: CompletedHandSource): GameHistoryHand | null {
  if ((game.phase !== 'handScored' && game.phase !== 'gameOver') || !game.lastHand) return null
  const last = game.lastHand
  const cloneHands = (hands: Trip<Card[]>): Trip<Card[]> =>
    hands.map((hand) => hand.map((card) => ({ ...card }))) as Trip<Card[]>

  if (last.kind === 'refe') {
    return {
      kind: 'refe',
      handNo: last.handNo,
      dealer: game.dealer,
      initialHands: cloneHands(last.initialHands),
      talon: last.talon.map((card) => ({ ...card })),
      refeWritten: last.refeWritten,
    }
  }

  return {
    kind: 'played',
    handNo: last.handNo,
    dealer: game.dealer,
    declarer: last.declarer,
    contract: last.contract,
    kontra: last.kontra,
    kontraBy: last.kontraBy,
    inviteCaller: last.inviteCaller,
    following: [...game.following] as Trip<boolean>,
    refeApplied: last.refeApplied,
    tricksWon: [...last.tricksWon] as Trip<number>,
    initialHands: cloneHands(last.initialHands),
    passed: last.passed,
    buleDelta: [...last.buleDelta] as Trip<number>,
    supeDelta: last.supeDelta.map((row) => [...row]) as Trip<Trip<number>>,
    bidLog: game.bidLog.map((entry) => ({ ...entry })),
    tricksLog: game.tricksLog.map((trick) => ({
      winner: trick.winner,
      cards: trick.cards.map((played) => ({ seat: played.seat, card: { ...played.card } })),
    })),
    talon: game.talon.map((card) => ({ ...card })),
    discard: last.discard.map((card) => ({ ...card })),
  }
}

export function appendCompletedHandOnce(hands: GameHistoryHand[], game: CompletedHandSource): GameHistoryHand[] {
  const hand = completedHandFromGame(game)
  if (!hand) return hands
  if (hands.some((existing) => existing.handNo === hand.handNo)) return hands
  return [...hands, hand]
}

export function createGameHistoryRecord(input: GameHistoryInput): GameHistoryRecord {
  const finalScores = ([0, 1, 2] as Seat[]).map((seat) => scoreForSeat(input.game, seat)) as Trip<number>
  const standings = rankStandings(
    ([0, 1, 2] as Seat[]).map((seat) => ({
      seat,
      name: input.playerNames[seat],
      score: finalScores[seat],
    })),
  )

  return {
    schemaVersion: GAME_HISTORY_SCHEMA_VERSION,
    id: input.id,
    mode: input.mode ?? 'vs-cpu',
    seed: input.game.seed,
    difficulty: input.difficulty,
    humanSeat: input.humanSeat,
    playerNames: [...input.playerNames] as Trip<string>,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: Math.max(0, input.completedAt - input.startedAt),
    startingBule: input.game.config.startingBule,
    handCount: input.hands.length,
    finalLedger: input.game.ledger,
    scoreHistory: input.game.scoreHistory,
    finalScores,
    standings,
    hands: input.hands,
  }
}

