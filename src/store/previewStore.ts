import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GridConfig {
  rows: number
  cols: number
  spacing: number
  glowAmount: number
}

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
  grid: GridConfig
  watchedBuiltins: string[]
  watchedPatternVars: string[]
  watchValues: Record<string, unknown>
  toggle: () => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setGrid: (partial: Partial<GridConfig>) => void
  setWatchedBuiltins: (vars: string[]) => void
  setWatchedPatternVars: (vars: string[]) => void
  setWatchValues: (values: Record<string, unknown>) => void
}

export const previewInitialState = {
  isRunning: true,
  speed: 1,
  brightness: 1,
  grid: {
    rows: 16,
    cols: 16,
    spacing: 20,
    glowAmount: 8,
  },
  watchedBuiltins: ['delta', 'pixelCount'] as string[],
  watchedPatternVars: [] as string[],
  watchValues: {} as Record<string, unknown>,
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      ...previewInitialState,
      toggle: () => set((s) => ({ isRunning: !s.isRunning })),
      setSpeed: (speed) => set({ speed }),
      setBrightness: (brightness) => set({ brightness }),
      setGrid: (partial) => set((s) => ({ grid: { ...s.grid, ...partial } })),
      setWatchedBuiltins: (watchedBuiltins) => set({ watchedBuiltins }),
      setWatchedPatternVars: (watchedPatternVars) => set({ watchedPatternVars }),
      setWatchValues: (watchValues) => set({ watchValues }),
    }),
    {
      name: 'pixelblaze-preview',
      partialize: (s) => ({ brightness: s.brightness, speed: s.speed, grid: s.grid }),
    }
  )
)
