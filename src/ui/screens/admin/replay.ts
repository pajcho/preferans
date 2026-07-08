// Panel „Karte i štihovi" u adminu: rekonstrukcija ruku iz DO loga poteza (determinističan
// replay kroz engine). Radi za sve partije koje žive u DO storage-u (uklj. vs-kompjuter,
// koji su sada obične online partije sa botovima).
import type { Seat, Trip } from '@engine';
import { buildReplayHands } from '@/history/replay';
import type { GameHistoryHand } from '@/history/types';
import type { AdminGameDetail } from '@/protocol/admin';

export interface ReplayView {
  hands: GameHistoryHand[];
  playerNames: Trip<string>;
  humanSeat: Seat;
}

export function replayView(detail: AdminGameDetail): ReplayView | null {
  const actions = detail.live?.actions;
  if (!actions?.length) return null;
  const hands = buildReplayHands(actions.map((a) => a.action));
  if (!hands.length) return null;
  return { hands, playerNames: seatNames(detail), humanSeat: firstHumanSeat(detail) };
}

function seatNames(detail: AdminGameDetail): Trip<string> {
  const names: Trip<string> = ['sedište 0', 'sedište 1', 'sedište 2'];
  for (const p of detail.game.players) names[p.seat] = p.displayName;
  return names;
}

function firstHumanSeat(detail: AdminGameDetail): Seat {
  return (detail.game.players.find((p) => !p.isBot)?.seat ?? 0) as Seat;
}
