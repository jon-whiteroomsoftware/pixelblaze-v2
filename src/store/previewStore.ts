import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clampGridDim, DEFAULT_LIGHT_SIZE } from '../engine/camera'

export interface GridConfig {
  rows: number
  cols: number
  spacing: number
}

export type FidelityMode = 'fidelity' | 'fast'

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
  grid: GridConfig
  // Preview light size (ADR-0006): the drawn diameter of each light source as a
  // fraction of the inter-dot pitch (diameter = pitch × lightSize). Grows the
  // sources in place — never moves dots or resizes the canvas. A preview-only
  // viewing-comfort pref, persisted globally; never written to a map/controller.
  lightSize: number
  // Diffusion (ADR-0006): a blur that merges the light sources. A sibling
  // viewport pref alongside lightSize — deliberately NOT inside `grid`, so no
  // preview construct lives in anything that could serialize toward a map. Hard
  // invariants: it never changes source size, and it never dims the field.
  diffusion: number
  fidelity: FidelityMode
  watchedBuiltins: string[]
  watchedPatternVars: string[]
  watchValues: Record<string, unknown>
  fps: number | null
  toggle: () => void
  setFps: (fps: number | null) => void
  setFidelity: (fidelity: FidelityMode) => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setLightSize: (lightSize: number) => void
  setDiffusion: (diffusion: number) => void
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
    rows: 32,
    cols: 32,
    spacing: 20,
  },
  lightSize: DEFAULT_LIGHT_SIZE,
  diffusion: 0.5,
  // The Fast renderer (float64) is the default on load: it's the smoother,
  // good-enough preview. The Precise renderer (16.16 fixed-point) is an opt-in
  // for checking hardware-accurate behaviour — and even it isn't bit-exact
  // without the device. Transient session state for now — persistence is #90.
  fidelity: 'fast' as FidelityMode,
  watchedBuiltins: ['elapsed', 'pixelCount'] as string[],
  watchedPatternVars: [] as string[],
  watchValues: {} as Record<string, unknown>,
  // Smoothed frames-per-second readout; null while paused/not yet measured.
  // Transient session state — never persisted.
  fps: null as number | null,
}

// Clamp a (possibly partial) grid's dimensions to the renderer's hard ceiling,
// projecting down to just the known fields so a legacy blob's stray keys (e.g.
// the pre-ADR-0006 `grid.diffusion`) never leak back onto `grid`. Guards against
// an absurdly large persisted value freezing the tab on load.
function clampGrid(grid: GridConfig): GridConfig {
  return { rows: clampGridDim(grid.rows), cols: clampGridDim(grid.cols), spacing: grid.spacing }
}

// Light size sweeps f: 0.15 (clearly separated) → 0.95 (almost touching), with
// 0.5 the default (ADR-0006). Clamp so a stale or fat-fingered value can neither
// collapse sources to a point nor balloon them past touching.
export const MIN_LIGHT_SIZE = 0.15
export const MAX_LIGHT_SIZE = 0.95
function clampLightSize(f: number): number {
  if (!Number.isFinite(f)) return DEFAULT_LIGHT_SIZE
  return Math.max(MIN_LIGHT_SIZE, Math.min(MAX_LIGHT_SIZE, f))
}

// Diffusion sweeps 0 (crisp/distinct sources) → 1 (opaque merged field).
function clampDiffusion(d: number): number {
  if (!Number.isFinite(d)) return 0
  return Math.max(0, Math.min(1, d))
}

// Deep-merge persisted state over the live state so a persisted `grid` that
// predates a newly-added field falls back to its default instead of arriving as
// `undefined`. The default shallow merge would replace the whole grid object,
// dropping any key the saved blob never had. Dimensions are clamped here so a
// stale oversized blob can never reach the renderer. `diffusion` migrated out of
// `grid` (ADR-0006), so a pre-rework blob's `grid.diffusion` is honoured as the
// fallback for the new top-level field.
export function mergePersistedPreview(persisted: unknown, current: PreviewState): PreviewState {
  const p = (persisted ?? {}) as Partial<
    Pick<PreviewState, 'brightness' | 'speed' | 'grid' | 'lightSize' | 'diffusion'>
  > & { grid?: { diffusion?: number } }
  const legacyDiffusion = p.grid?.diffusion
  return {
    ...current,
    ...p,
    grid: clampGrid({ ...current.grid, ...(p.grid ?? {}) }),
    lightSize: clampLightSize(p.lightSize ?? current.lightSize),
    diffusion: clampDiffusion(p.diffusion ?? legacyDiffusion ?? current.diffusion),
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      ...previewInitialState,
      toggle: () => set((s) => ({ isRunning: !s.isRunning })),
      setFps: (fps) => set({ fps }),
      setFidelity: (fidelity) => set({ fidelity }),
      setSpeed: (speed) => set({ speed }),
      setBrightness: (brightness) => set({ brightness }),
      setLightSize: (lightSize) => set({ lightSize: clampLightSize(lightSize) }),
      setDiffusion: (diffusion) => set({ diffusion: clampDiffusion(diffusion) }),
      setGrid: (partial) => set((s) => ({ grid: clampGrid({ ...s.grid, ...partial }) })),
      setWatchedBuiltins: (watchedBuiltins) => set({ watchedBuiltins }),
      setWatchedPatternVars: (watchedPatternVars) => set({ watchedPatternVars }),
      setWatchValues: (watchValues) => set({ watchValues }),
    }),
    {
      name: 'pixelblaze-preview',
      partialize: (s) => ({
        brightness: s.brightness,
        speed: s.speed,
        grid: s.grid,
        lightSize: s.lightSize,
        diffusion: s.diffusion,
      }),
      merge: mergePersistedPreview,
    }
  )
)
