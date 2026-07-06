import { describe, expect, it } from 'vitest'
import { GAME_HISTORY_STORAGE_KEY, createLocalGameHistoryRepository } from './localStorageRepository'
import type { GameHistoryHand, GameHistoryRecord } from './types'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  }
}

function makeHand(overrides: Partial<GameHistoryHand> = {}): GameHistoryHand {
  return {
    handNo: 1,
    dealer: 0,
    declarer: 1,
    contract: { kind: 'suit', trump: 'pik', asGame: false },
    kontra: 0,
    kontraBy: null,
    inviteCaller: null,
    following: [true, false, true],
    refeApplied: false,
    tricksWon: [2, 6, 2],
    initialHands: [[], [], []],
    passed: true,
    buleDelta: [0, -4, 0],
    supeDelta: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    bidLog: [],
    tricksLog: [],
    talon: [],
    discard: [],
    ...overrides,
  }
}

function makeRecord(hands: GameHistoryHand[]): GameHistoryRecord {
  return {
    schemaVersion: 1,
    id: 'r1',
    mode: 'vs-cpu',
    seed: 42,
    difficulty: 'medium',
    humanSeat: 0,
    playerNames: ['Ja', 'Boki', 'Ceca'],
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    startingBule: 40,
    handCount: hands.length,
    finalLedger: {
      bule: [36, 40, 40],
      supe: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      refe: [0, 0, 0],
    },
    scoreHistory: [[], [], []],
    finalScores: [0, 0, 0],
    standings: [
      { seat: 0, name: 'Ja', score: 0, rank: 1 },
      { seat: 1, name: 'Boki', score: 0, rank: 1 },
      { seat: 2, name: 'Ceca', score: 0, rank: 1 },
    ],
    hands,
  }
}

describe('localStorageRepository', () => {
  it('dopunjuje initialHands u starim zapisima (šema pre PR #6)', () => {
    // zapis snimljen pre nego što je initialHands dodat u šemu
    const oldHand = makeHand()
    // @ts-expect-error — simulira stari zapis bez polja
    delete oldHand.initialHands
    const storage = memoryStorage({
      [GAME_HISTORY_STORAGE_KEY]: JSON.stringify([makeRecord([oldHand])]),
    })

    const [record] = createLocalGameHistoryRepository(storage).loadAll()
    expect(record.hands[0].initialHands).toEqual([[], [], []])
  })

  it('nove zapise vraća nepromenjene', () => {
    const hand = makeHand({ initialHands: [[{ suit: 'pik', rank: 'A' }], [], []] })
    const storage = memoryStorage({
      [GAME_HISTORY_STORAGE_KEY]: JSON.stringify([makeRecord([hand])]),
    })

    const [record] = createLocalGameHistoryRepository(storage).loadAll()
    expect(record.hands[0].initialHands).toEqual([[{ suit: 'pik', rank: 'A' }], [], []])
  })

  it('preskače zapise pogrešnog oblika', () => {
    const storage = memoryStorage({
      [GAME_HISTORY_STORAGE_KEY]: JSON.stringify([{ id: 'x' }, 42, null]),
    })
    expect(createLocalGameHistoryRepository(storage).loadAll()).toEqual([])
  })
})
