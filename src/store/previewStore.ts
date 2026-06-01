import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_LIGHT_SIZE } from '../engine/camera'

export type FidelityMode = 'fidelity' | 'fast'

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
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
  // All-or-nothing pattern-variable watch (#150): when on, the readout shows every
  // exported pattern variable; when off, none. Replaces the per-variable + sensor-
  // builtin checkbox model. Transient session state — not persisted.
  watchPatternVars: boolean
  watchValues: Record<string, unknown>
  fps: number | null
  // Pattern elapsed time (ms), updated every frame so the readout's `elapsed` cell
  // is unconditional (#150). null while paused/not yet measured. Never persisted.
  elapsed: number | null
  toggle: () => void
  setFps: (fps: number | null) => void
  setElapsed: (elapsed: number | null) => void
  setFidelity: (fidelity: FidelityMode) => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setLightSize: (lightSize: number) => void
  setDiffusion: (diffusion: number) => void
  setWatchPatternVars: (on: boolean) => void
  setWatchValues: (values: Record<string, unknown>) => void
}

export const previewInitialState = {
  isRunning: true,
  speed: 1,
  brightness: 1,
  lightSize: DEFAULT_LIGHT_SIZE,
  diffusion: 0.5,
  // The Fast renderer (float64) is the default on load: it's the smoother,
  // good-enough preview. The Precise renderer (16.16 fixed-point) is an opt-in
  // for checking hardware-accurate behaviour — and even it isn't bit-exact
  // without the device. Transient session state for now — persistence is #90.
  fidelity: 'fast' as FidelityMode,
  watchPatternVars: false,
  watchValues: {} as Record<string, unknown>,
  // Smoothed frames-per-second readout; null while paused/not yet measured.
  // Transient session state — never persisted.
  fps: null as number | null,
  // Pattern elapsed time (ms); null while paused/not yet measured. Never persisted.
  elapsed: null as number | null,
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

// Merge persisted state over the live state. The preview-wide `grid` is retired
// (ADR-0009 — the active map's resolved `pos` is the single source of extent and
// aspect), so a legacy blob's `grid` is explicitly destructured OUT and dropped:
// it can never land back on state. `diffusion` migrated out of `grid` (ADR-0006),
// so a pre-rework blob's `grid.diffusion` is still honoured as the fallback for
// the top-level field before the grid is discarded.
export function mergePersistedPreview(persisted: unknown, current: PreviewState): PreviewState {
  const raw = (persisted ?? {}) as Partial<
    Pick<PreviewState, 'brightness' | 'speed' | 'lightSize' | 'diffusion'>
  > & { grid?: { diffusion?: number } }
  const { grid: legacyGrid, ...p } = raw
  return {
    ...current,
    ...p,
    lightSize: clampLightSize(p.lightSize ?? current.lightSize),
    diffusion: clampDiffusion(p.diffusion ?? legacyGrid?.diffusion ?? current.diffusion),
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      ...previewInitialState,
      toggle: () => set((s) => ({ isRunning: !s.isRunning })),
      setFps: (fps) => set({ fps }),
      setElapsed: (elapsed) => set({ elapsed }),
      setFidelity: (fidelity) => set({ fidelity }),
      setSpeed: (speed) => set({ speed }),
      setBrightness: (brightness) => set({ brightness }),
      setLightSize: (lightSize) => set({ lightSize: clampLightSize(lightSize) }),
      setDiffusion: (diffusion) => set({ diffusion: clampDiffusion(diffusion) }),
      setWatchPatternVars: (watchPatternVars) => set({ watchPatternVars }),
      setWatchValues: (watchValues) => set({ watchValues }),
    }),
    {
      name: 'pixelblaze-preview',
      // No grid is persisted: the preview's extent/aspect derive from the active
      // map's resolved `pos` (ADR-0009) and the pitch is fit to the container each
      // resize. Only true viewport prefs ride in localStorage.
      partialize: (s) => ({
        brightness: s.brightness,
        speed: s.speed,
        lightSize: s.lightSize,
        diffusion: s.diffusion,
      }),
      merge: mergePersistedPreview,
    }
  )
)
