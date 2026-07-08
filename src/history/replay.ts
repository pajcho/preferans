// Rekonstrukcija partije iz loga poteza (INIT + engine akcije) — determinističan replay
// kroz engine. Koristi ga istorija (klijent), admin panel I worker (server-side, za
// „Prethodne ruke" backfill). Isto što DO radi uživo, samo unazad: iz zapisanog loga
// dobijamo identične ruke i završno stanje.
// Uvozi se RELATIVNO (bez @ aliasa) jer ga bundluje i Cloudflare worker.
import { createGame, reduce } from '../engine/index.ts';
import type { GameState } from '../engine/index.ts';
import type { LoggedAction } from '../protocol/messages.ts';
import { appendCompletedHandOnce } from './gameHistory.ts';
import type { GameHistoryHand } from './types.ts';

export function reconstructGame(actions: LoggedAction[]): { hands: GameHistoryHand[]; final: GameState | null } {
  let state: GameState | null = null;
  let hands: GameHistoryHand[] = [];
  for (const action of actions) {
    if (action.type === 'INIT') {
      state = createGame(action.config, action.seed, 0);
      continue;
    }
    if (!state) continue;
    try {
      state = reduce(state, action);
    } catch {
      // Stari log (pre refe-pauze, PR #15): posle refe (svi „dalje") ruke NEXT_HAND NIJE
      // upisivan — stari engine je odmah auto-delio sledeću ruku. Novi engine pauzira na
      // 'handScored' i čeka NEXT_HAND, pa sledeći potez iz starog loga (bid nove ruke) ne
      // može da se reduce-uje. Ubaci NEXT_HAND i probaj potez ponovo; svaki drugi nesklad
      // i dalje staje (kao pre) umesto da pukne.
      if (state.phase === 'handScored') {
        try {
          state = reduce(reduce(state, { type: 'NEXT_HAND' }), action);
        } catch {
          break;
        }
      } else {
        break;
      }
    }
    hands = appendCompletedHandOnce(hands, state);
  }
  return { hands, final: state };
}

/** Samo obodovane ruke (npr. za admin panel „Karte i štihovi"). */
export function buildReplayHands(actions: LoggedAction[]): GameHistoryHand[] {
  return reconstructGame(actions).hands;
}
