import { describe, expect, it } from 'vitest';
import type { GameState } from '@engine';
import { projectScoreHistory } from './scoreHistoryProjection';

describe('projectScoreHistory', () => {
  it('crta jedan zajednički refe trougao sa stranama koje su igrači potrošili', () => {
    const history: GameState['scoreHistory'] = [
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: true },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: true },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: false },
      ],
    ];

    expect(projectScoreHistory(history, [1, 0, 2])).toEqual([
      { kind: 'bule', handNo: 0, value: 40, delta: 0 },
      { kind: 'refe', handNo: 1, sides: ['left', 'bottom'] },
    ]);
  });

  it('za više refe-a zaredom prikazuje noviji refe gore, pa stariji ispod', () => {
    const history: GameState['scoreHistory'] = [
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: true },
        { kind: 'refe', handNo: 2, used: true },
        { kind: 'bule', handNo: 4, value: 18, delta: -22 },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: true },
        { kind: 'refe', handNo: 2, used: false },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'refe', handNo: 1, used: false },
        { kind: 'refe', handNo: 2, used: true },
      ],
    ];

    expect(projectScoreHistory(history, [1, 0, 2])).toEqual([
      { kind: 'bule', handNo: 0, value: 40, delta: 0 },
      { kind: 'refe', handNo: 2, sides: ['bottom', 'right'] },
      { kind: 'refe', handNo: 1, sides: ['left', 'bottom'] },
      { kind: 'bule', handNo: 4, value: 18, delta: -22 },
    ]);
  });

  it('zadržava šešir markere i ignoriše brojeve protivnika u bočnim kolonama', () => {
    const history: GameState['scoreHistory'] = [
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'hat', handNo: 3, crossed: false },
        { kind: 'bule', handNo: 3, value: -6, delta: -46 },
        { kind: 'hat', handNo: 4, crossed: true },
        { kind: 'bule', handNo: 4, value: 14, delta: 20 },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'bule', handNo: 2, value: 30, delta: -10 },
      ],
      [
        { kind: 'bule', handNo: 0, value: 40, delta: 0 },
        { kind: 'bule', handNo: 2, value: 28, delta: -12 },
      ],
    ];

    expect(projectScoreHistory(history, [1, 0, 2])).toEqual([
      { kind: 'bule', handNo: 0, value: 40, delta: 0 },
      { kind: 'hat', handNo: 3, crossed: false },
      { kind: 'bule', handNo: 3, value: -6, delta: -46 },
      { kind: 'hat', handNo: 4, crossed: true },
      { kind: 'bule', handNo: 4, value: 14, delta: 20 },
    ]);
  });
});
