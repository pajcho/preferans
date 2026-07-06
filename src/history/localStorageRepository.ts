import { GAME_HISTORY_SCHEMA_VERSION, type GameHistoryHand, type GameHistoryRecord } from './types'

export const GAME_HISTORY_STORAGE_KEY = 'prefa-game-history-v1'

export interface GameHistoryRepository {
  loadAll(): GameHistoryRecord[]
  saveAll(records: GameHistoryRecord[]): void
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isHistoryRecord(value: unknown): value is GameHistoryRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<GameHistoryRecord>
  return (
    record.schemaVersion === GAME_HISTORY_SCHEMA_VERSION &&
    typeof record.id === 'string' &&
    record.mode === 'vs-cpu' &&
    typeof record.startedAt === 'number' &&
    typeof record.completedAt === 'number' &&
    Array.isArray(record.hands) &&
    Array.isArray(record.standings)
  )
}

/**
 * `initialHands` je dodat u šemu naknadno (PR #6) bez bump-a verzije —
 * zapisi snimljeni pre toga ga nemaju, pa bi prikaz pukao. Dopuni prazninom
 * (UI za prazne ruke prikazuje „-").
 */
function normalizeHand(hand: GameHistoryHand): GameHistoryHand {
  return hand.initialHands ? hand : { ...hand, initialHands: [[], [], []] }
}

function normalizeRecord(record: GameHistoryRecord): GameHistoryRecord {
  if (record.hands.every((hand) => hand.initialHands)) return record
  return { ...record, hands: record.hands.map(normalizeHand) }
}

export function createLocalGameHistoryRepository(storage: Storage | null = getStorage()): GameHistoryRepository {
  return {
    loadAll() {
      if (!storage) return []
      try {
        const raw = storage.getItem(GAME_HISTORY_STORAGE_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isHistoryRecord).map(normalizeRecord)
      } catch {
        return []
      }
    },
    saveAll(records) {
      if (!storage) return
      storage.setItem(GAME_HISTORY_STORAGE_KEY, JSON.stringify(records))
    },
  }
}

