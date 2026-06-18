import { create } from 'zustand'
import { createLocalGameHistoryRepository } from '@/history/localStorageRepository'
import { insertHistoryRecord } from '@/history/gameHistory'
import type { GameHistoryRecord } from '@/history/types'

interface HistoryStore {
  records: GameHistoryRecord[]
  reload: () => void
  saveRecord: (record: GameHistoryRecord) => void
  removeRecord: (id: string) => void
  clear: () => void
}

const repository = createLocalGameHistoryRepository()

export const useHistoryStore = create<HistoryStore>()((set, get) => ({
  records: repository.loadAll(),
  reload: () => set({ records: repository.loadAll() }),
  saveRecord: (record) => {
    const records = insertHistoryRecord(get().records, record)
    repository.saveAll(records)
    set({ records })
  },
  removeRecord: (id) => {
    const records = get().records.filter((record) => record.id !== id)
    repository.saveAll(records)
    set({ records })
  },
  clear: () => {
    repository.saveAll([])
    set({ records: [] })
  },
}))

