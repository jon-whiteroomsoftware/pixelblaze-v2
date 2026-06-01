import { describe, it, expect, beforeEach } from 'vitest'
import { usePreviewStore, previewInitialState, mergePersistedPreview } from './previewStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
})

describe('previewStore', () => {
  it('starts running', () => {
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggle flips running state', () => {
    usePreviewStore.getState().toggle()
    expect(usePreviewStore.getState().isRunning).toBe(false)
    usePreviewStore.getState().toggle()
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('has default speed of 1', () => {
    expect(usePreviewStore.getState().speed).toBe(1)
  })

  it('setSpeed updates speed', () => {
    usePreviewStore.getState().setSpeed(2)
    expect(usePreviewStore.getState().speed).toBe(2)
  })

  it('has default brightness of 1', () => {
    expect(usePreviewStore.getState().brightness).toBe(1)
  })

  it('setBrightness updates brightness', () => {
    usePreviewStore.getState().setBrightness(0.5)
    expect(usePreviewStore.getState().brightness).toBe(0.5)
  })

  it('holds no preview-wide grid (retired in ADR-0009)', () => {
    expect('grid' in usePreviewStore.getState()).toBe(false)
    expect('setGrid' in usePreviewStore.getState()).toBe(false)
  })

  it('defaults light size to 0.5 and diffusion to 0.5 (preview viewport prefs)', () => {
    const s = usePreviewStore.getState()
    expect(s.lightSize).toBe(0.5)
    expect(s.diffusion).toBe(0.5)
  })

  it('does not watch pattern variables by default (all-or-nothing, collapsed)', () => {
    expect(usePreviewStore.getState().watchPatternVars).toBe(false)
  })

  it('setWatchPatternVars toggles the all-or-nothing watch', () => {
    usePreviewStore.getState().setWatchPatternVars(true)
    expect(usePreviewStore.getState().watchPatternVars).toBe(true)
    usePreviewStore.getState().setWatchPatternVars(false)
    expect(usePreviewStore.getState().watchPatternVars).toBe(false)
  })

  it('setElapsed updates the elapsed telemetry', () => {
    usePreviewStore.getState().setElapsed(1234)
    expect(usePreviewStore.getState().elapsed).toBe(1234)
  })

  it('setWatchValues updates watch values', () => {
    usePreviewStore.getState().setWatchValues({ delta: 16.7, t: 0.42 })
    expect(usePreviewStore.getState().watchValues).toEqual({ delta: 16.7, t: 0.42 })
  })
})

describe('mergePersistedPreview', () => {
  it('drops a legacy persisted grid without crashing or landing it on state', () => {
    const current = usePreviewStore.getState()
    const persisted = { grid: { rows: 8, cols: 8, spacing: 20 } }
    const merged = mergePersistedPreview(persisted, current)
    expect('grid' in merged).toBe(false)
  })

  it('migrates a pre-ADR-0006 blob: legacy grid.diffusion lifts to the top level', () => {
    const current = usePreviewStore.getState()
    // Simulate a blob saved before diffusion was hoisted out of `grid`.
    const persisted = { grid: { rows: 16, cols: 16, spacing: 20, diffusion: 0.6 } }
    const merged = mergePersistedPreview(persisted, current)
    expect(merged.diffusion).toBe(0.6)
    expect('grid' in merged).toBe(false)
  })

  it('prefers a top-level persisted diffusion over a legacy grid.diffusion', () => {
    const current = usePreviewStore.getState()
    const persisted = { diffusion: 0.2, grid: { rows: 16, cols: 16, spacing: 20, diffusion: 0.6 } }
    expect(mergePersistedPreview(persisted, current).diffusion).toBe(0.2)
  })

  it('defaults lightSize and diffusion when absent from a pre-feature blob', () => {
    const current = usePreviewStore.getState()
    const merged = mergePersistedPreview({}, current)
    expect(merged.lightSize).toBe(previewInitialState.lightSize)
    expect(merged.diffusion).toBe(previewInitialState.diffusion)
  })

  it('preserves and clamps a persisted lightSize to the 0.15–0.95 range', () => {
    const current = usePreviewStore.getState()
    expect(mergePersistedPreview({ lightSize: 0.7 }, current).lightSize).toBe(0.7)
    expect(mergePersistedPreview({ lightSize: 99 }, current).lightSize).toBe(0.95)
    expect(mergePersistedPreview({ lightSize: 0 }, current).lightSize).toBe(0.15)
  })
})

describe('lightSize', () => {
  it('defaults to 0.5', () => {
    expect(usePreviewStore.getState().lightSize).toBe(0.5)
  })

  it('setLightSize clamps to the 0.15–0.95 range', () => {
    usePreviewStore.getState().setLightSize(0.7)
    expect(usePreviewStore.getState().lightSize).toBe(0.7)
    usePreviewStore.getState().setLightSize(100)
    expect(usePreviewStore.getState().lightSize).toBe(0.95)
    usePreviewStore.getState().setLightSize(-5)
    expect(usePreviewStore.getState().lightSize).toBe(0.15)
  })
})

describe('diffusion', () => {
  it('setDiffusion clamps to the 0–1 range', () => {
    usePreviewStore.getState().setDiffusion(0.3)
    expect(usePreviewStore.getState().diffusion).toBe(0.3)
    usePreviewStore.getState().setDiffusion(2)
    expect(usePreviewStore.getState().diffusion).toBe(1)
    usePreviewStore.getState().setDiffusion(-1)
    expect(usePreviewStore.getState().diffusion).toBe(0)
  })
})
