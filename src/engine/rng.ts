// Deterministički PRNG (mulberry32). Bez Math.random — sve je seed-ovano,
// pa su deljenja reproduktivna (bitno za testove i replay).

export function mulberry32(state: number): number {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

export interface RngStep {
  value: number; // [0, 1)
  state: number;
}

export function nextRandom(state: number): RngStep {
  const s = mulberry32(state);
  return { value: s / 0x100000000, state: s };
}

/** Fisher–Yates; vraća nov niz i novo stanje (ne mutira ulaz). */
export function shuffle<T>(arr: readonly T[], state: number): { result: T[]; state: number } {
  const result = arr.slice();
  let s = state;
  for (let i = result.length - 1; i > 0; i--) {
    const step = nextRandom(s);
    s = step.state;
    const j = Math.floor(step.value * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return { result, state: s };
}
