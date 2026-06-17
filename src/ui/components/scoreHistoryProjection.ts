import type { GameState, ScoreHistoryEntry, Seat } from '@engine'

export type RefeSide = 'left' | 'right' | 'bottom'

export type ScoreHistoryDisplayEntry =
  | Extract<ScoreHistoryEntry, { kind: 'bule' | 'hat' }>
  | { kind: 'refe'; handNo: number; sides: RefeSide[] }

export function projectScoreHistory(source: GameState['scoreHistory'], seats: Seat[]): ScoreHistoryDisplayEntry[] {
  const [leftSeat, humanSeat, rightSeat] = seats
  const humanEntries = source[humanSeat] ?? []
  const rows: ScoreHistoryDisplayEntry[] = []

  const usedSideFor = (seat: Seat, handNo: number): boolean =>
    (source[seat] ?? []).some((entry) => entry.kind === 'refe' && entry.handNo === handNo && entry.used)

  const sharedRefe = (handNo: number): ScoreHistoryDisplayEntry => {
    const sides: RefeSide[] = []
    if (usedSideFor(leftSeat, handNo)) sides.push('left')
    if (usedSideFor(humanSeat, handNo)) sides.push('bottom')
    if (usedSideFor(rightSeat, handNo)) sides.push('right')
    return { kind: 'refe', handNo, sides }
  }

  for (let i = 0; i < humanEntries.length; i += 1) {
    const entry = humanEntries[i]
    if (entry.kind !== 'refe') {
      rows.push(entry)
      continue
    }

    const refeRun: ScoreHistoryEntry[] = []
    while (i < humanEntries.length && humanEntries[i].kind === 'refe') {
      refeRun.push(humanEntries[i])
      i += 1
    }
    i -= 1

    // Kad ima više refe-a zaredom, prvi sledeći odigran refe precrtava gornji trougao.
    rows.push(...refeRun.reverse().map((refe) => sharedRefe(refe.handNo)))
  }

  return rows
}
