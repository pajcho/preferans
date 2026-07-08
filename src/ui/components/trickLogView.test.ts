import { describe, expect, it } from 'vitest';
import type { CompletedTrick, PlayedCard, Seat } from '@engine';
import { orderedTrickCards, trickFlowColumns } from './trickLogView';

describe('orderedTrickCards', () => {
  it('drži štih karte u fiksnim kolonama levo/sredina/desno nezavisno od redosleda igranja', () => {
    const cards: PlayedCard[] = [
      { seat: 0, card: { suit: 'karo', rank: '7' } },
      { seat: 2, card: { suit: 'pik', rank: 'A' } },
      { seat: 1, card: { suit: 'herc', rank: '10' } },
    ];

    expect(orderedTrickCards(cards, [2, 0, 1])).toEqual([
      { suit: 'pik', rank: 'A' },
      { suit: 'karo', rank: '7' },
      { suit: 'herc', rank: '10' },
    ]);
  });

  it('ostavlja praznu kolonu dok igrač još nije odigrao kartu', () => {
    const cards: PlayedCard[] = [
      { seat: 2, card: { suit: 'pik', rank: 'A' } },
      { seat: 0, card: { suit: 'karo', rank: '7' } },
    ];

    expect(orderedTrickCards(cards, [2, 0, 1])).toEqual([
      { suit: 'pik', rank: 'A' },
      { suit: 'karo', rank: '7' },
      undefined,
    ]);
  });
});

describe('trickFlowColumns', () => {
  it('pomera svaku kolonu tako da štih počne od igrača koji je vodio', () => {
    const right: Seat = 1;
    const left: Seat = 2;
    const me: Seat = 0;
    const rowSeats: Seat[] = [right, left, me, right, left];
    const tricks: CompletedTrick[] = [
      {
        winner: right,
        cards: [
          { seat: right, card: { suit: 'karo', rank: 'K' } },
          { seat: left, card: { suit: 'karo', rank: 'J' } },
          { seat: me, card: { suit: 'karo', rank: 'A' } },
        ],
      },
      {
        winner: left,
        cards: [
          { seat: left, card: { suit: 'pik', rank: '8' } },
          { seat: me, card: { suit: 'pik', rank: 'A' } },
          { seat: right, card: { suit: 'pik', rank: '10' } },
        ],
      },
      {
        winner: me,
        cards: [
          { seat: me, card: { suit: 'tref', rank: 'Q' } },
          { seat: right, card: { suit: 'tref', rank: '10' } },
          { seat: left, card: { suit: 'tref', rank: '7' } },
        ],
      },
    ];

    const columns = trickFlowColumns(tricks, rowSeats, 3);

    expect(columns.map((column) => column.seatsByRow)).toEqual([
      [right, left, me, undefined, undefined],
      [undefined, left, me, right, undefined],
      [undefined, undefined, me, right, left],
    ]);
    expect(columns[0].cardsByRow.map((card) => card?.rank)).toEqual(['K', 'J', 'A', undefined, undefined]);
    expect(columns[1].cardsByRow.map((card) => card?.rank)).toEqual([undefined, '8', 'A', '10', undefined]);
    expect(columns[2].cardsByRow.map((card) => card?.rank)).toEqual([undefined, undefined, 'Q', '10', '7']);
  });
});
