import { GAME_HISTORY_SCHEMA_VERSION, type GameHistoryRecord } from './types'

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

export function createLocalGameHistoryRepository(storage: Storage | null = getStorage()): GameHistoryRepository {
  return {
    loadAll() {
      if (!storage) return []
      try {
        const raw = storage.getItem(GAME_HISTORY_STORAGE_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isHistoryRecord)
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

