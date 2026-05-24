import { create } from 'zustand'

interface PatternState {
  activePatternId: string | null
  setActivePattern: (id: string | null) => void
}

export const patternInitialState = {
  activePatternId: null as string | null,
}

export const usePatternStore = create<PatternState>()((set) => ({
  ...patternInitialState,
  setActivePattern: (id) => set({ activePatternId: id }),
}))
