import { create } from 'zustand'

export interface GridConfig {
  rows: number
  cols: number
  spacing: number
  glow: boolean
  glowAmount: number
}

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
  grid: GridConfig
  toggle: () => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setGrid: (partial: Partial<GridConfig>) => void
}

export const previewInitialState = {
  isRunning: false,
  speed: 1,
  brightness: 1,
  grid: {
    rows: 16,
    cols: 16,
    spacing: 20,
    glow: true,
    glowAmount: 8,
  },
}

export const usePreviewStore = create<PreviewState>()((set) => ({
  ...previewInitialState,
  toggle: () => set((s) => ({ isRunning: !s.isRunning })),
  setSpeed: (speed) => set({ speed }),
  setBrightness: (brightness) => set({ brightness }),
  setGrid: (partial) => set((s) => ({ grid: { ...s.grid, ...partial } })),
}))
