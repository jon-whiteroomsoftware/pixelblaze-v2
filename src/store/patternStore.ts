import { create } from 'zustand'
import {
  PatternRecord,
  createPattern,
  listPatterns,
  updatePattern,
  deletePattern,
} from '@/engine/storage'

export type { PatternRecord }

interface PatternState {
  activePatternId: string | null
  activeLibraryName: string | null
  activeDemoName: string | null
  userPatterns: PatternRecord[]
  setActivePattern: (id: string | null) => void
  setActiveLibrary: (name: string | null) => void
  setActiveDemo: (name: string | null) => void
  loadPatterns: () => Promise<void>
  addPattern: (record: PatternRecord) => Promise<void>
  renamePattern: (id: string, name: string) => Promise<void>
  removePattern: (id: string) => Promise<void>
  updatePatternSrc: (id: string, src: string) => Promise<void>
}

export const patternInitialState = {
  activePatternId: null as string | null,
  activeLibraryName: null as string | null,
  activeDemoName: null as string | null,
  userPatterns: [] as PatternRecord[],
}

export const usePatternStore = create<PatternState>()((set, get) => ({
  ...patternInitialState,

  setActivePattern: (id) => set({ activePatternId: id, activeLibraryName: null, activeDemoName: null }),
  setActiveLibrary: (name) => set({ activeLibraryName: name, activePatternId: null, activeDemoName: null }),
  setActiveDemo: (name) => set({ activeDemoName: name, activeLibraryName: null, activePatternId: null }),

  loadPatterns: async () => {
    const patterns = await listPatterns()
    set({ userPatterns: patterns.sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  addPattern: async (record) => {
    await createPattern(record)
    set((s) => ({
      userPatterns: [record, ...s.userPatterns],
    }))
  },

  renamePattern: async (id, name) => {
    const updatedAt = Date.now()
    await updatePattern(id, { name, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, name, updatedAt } : p,
      ),
    }))
  },

  removePattern: async (id) => {
    await deletePattern(id)
    const { activePatternId, userPatterns } = get()
    const remaining = userPatterns.filter((p) => p.id !== id)
    set({
      userPatterns: remaining,
      activePatternId: activePatternId === id ? (remaining[0]?.id ?? null) : activePatternId,
    })
  },

  updatePatternSrc: async (id, src) => {
    const updatedAt = Date.now()
    await updatePattern(id, { src, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, src, updatedAt } : p,
      ),
    }))
  },
}))
