// Rekonstrukcija iz loga poteza mora da da ISTE ruke i ISTO završno stanje kao igra uživo.
// Vozimo celu partiju kroz reducer (isti tok kao GameRoom DO: bot potez / RESOLVE_TRICK /
// FINALIZE_CLAIM / NEXT_HAND), beležimo log, pa ga replay-ujemo i poredimo.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, activeSeatCount, chooseAction, createGame, currentActor, reduce } from '@engine';
import type { Action, GameState } from '@engine';
import type { LoggedAction } from '@/protocol/messages';
import { appendCompletedHandOnce } from './gameHistory';
import type { GameHistoryHand } from './types';
import { buildReplayHands, reconstructGame } from './replay';

function playThrough(seed: number): { log: LoggedAction[]; liveHands: GameHistoryHand[]; finalState: GameState } {
  const config = DEFAULT_CONFIG;
  let state: GameState = createGame(config, seed, 0);
  const log: LoggedAction[] = [{ type: 'INIT', seed, config }];
  let liveHands: GameHistoryHand[] = [];

  for (let guard = 0; state.phase !== 'gameOver' && guard < 20_000; guard += 1) {
    let action: Action;
    if (state.phase === 'playing' && state.trick && state.trick.cards.length === activeSeatCount(state)) {
      action = { type: 'RESOLVE_TRICK' };
    } else if (state.phase === 'claim') {
      action = { type: 'FINALIZE_CLAIM' };
    } else if (state.phase === 'handScored') {
      action = { type: 'NEXT_HAND' };
    } else {
      const actor = currentActor(state);
      if (actor === null) break;
      action = chooseAction(state, actor, 'easy');
    }
    state = reduce(state, action);
    log.push(action);
    liveHands = appendCompletedHandOnce(liveHands, state);
  }

  return { log, liveHands, finalState: state };
}

// Simulira STARI log (pre PR #15): ruka 1 = svi „dalje" (refe), pa se sledeća ruka auto-delila
// BEZ NEXT_HAND poteza u logu. Novi engine pauzira na 'handScored' → rekonstrukcija mora da se
// oporavi (ubaci NEXT_HAND) umesto da stane na prvoj refe ruci.
function oldStyleRefeLog(seed: number): LoggedAction[] {
  const config = DEFAULT_CONFIG;
  let state: GameState = createGame(config, seed, 0);
  const log: LoggedAction[] = [{ type: 'INIT', seed, config }];

  // Ruka 1: forsiraj sve „dalje" → refe
  while (state.phase === 'bidding') {
    const seat = currentActor(state);
    if (seat === null) break;
    const action: Action = { type: 'PASS', seat };
    state = reduce(state, action);
    log.push(action);
  }

  // deli ruku 2 — NEXT_HAND se NAMERNO ne upisuje u log (kao stari auto-deal)
  state = reduce(state, { type: 'NEXT_HAND' });

  // Ruka 2: normalna igra do sledećeg obodovanja (ostatak loga posle „rupe")
  for (let guard = 0; state.phase !== 'handScored' && state.phase !== 'gameOver' && guard < 5000; guard += 1) {
    let action: Action;
    if (state.phase === 'playing' && state.trick && state.trick.cards.length === activeSeatCount(state)) {
      action = { type: 'RESOLVE_TRICK' };
    } else if (state.phase === 'claim') {
      action = { type: 'FINALIZE_CLAIM' };
    } else {
      const actor = currentActor(state);
      if (actor === null) break;
      action = chooseAction(state, actor, 'easy');
    }
    state = reduce(state, action);
    log.push(action);
  }

  return log;
}

describe('reconstructGame (replay iz loga poteza)', () => {
  it.each([7, 12345])('rekonstrukcija = igra uživo (ruke + završno stanje) (seed %i)', (seed) => {
    const { log, liveHands, finalState } = playThrough(seed);

    expect(liveHands.length).toBeGreaterThanOrEqual(1);
    for (const hand of liveHands) {
      expect(hand.initialHands.flat()).toHaveLength(30); // 3×10 podeljenih karata
    }

    const { hands, final } = reconstructGame(log);
    expect(hands).toEqual(liveHands);
    expect(final).toEqual(finalState);
  });

  it('bez INIT-a (nepotpun/seed log) vraća prazno, ne baca', () => {
    expect(buildReplayHands([])).toEqual([]);
    expect(buildReplayHands([{ type: 'NEXT_HAND' }])).toEqual([]);
  });

  it('oporavi se od starog loga (refe bez NEXT_HAND) — ne staje na prvoj ruci', () => {
    const log = oldStyleRefeLog(7);
    const { hands, final } = reconstructGame(log);
    // bez oporavka bi stalo na 1 ruci (refe); sa oporavkom vidi i (auto-deljenu) ruku 2
    expect(hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(hands[0].kind).toBe('refe');
    expect(final).not.toBeNull();
  });
});
