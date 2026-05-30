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

  it('has default grid config', () => {
    const { grid } = usePreviewStore.getState()
    expect(grid.rows).toBe(32)
    expect(grid.cols).toBe(32)
    expect(grid.spacing).toBe(20)
    expect(grid.diffusion).toBe(0.5)
  })

  it('setGrid merges partial grid updates', () => {
    usePreviewStore.getState().setGrid({ rows: 8 })
    const { grid } = usePreviewStore.getState()
    expect(grid.rows).toBe(8)
    expect(grid.cols).toBe(32)
  })

  it('setGrid clamps dimensions above 256 to 256', () => {
    usePreviewStore.getState().setGrid({ rows: 100000, cols: 257 })
    const { grid } = usePreviewStore.getState()
    expect(grid.rows).toBe(256)
    expect(grid.cols).toBe(256)
  })

  it('setGrid clamps dimensions below 1 up to 1', () => {
    usePreviewStore.getState().setGrid({ rows: 0, cols: -5 })
    const { grid } = usePreviewStore.getState()
    expect(grid.rows).toBe(1)
    expect(grid.cols).toBe(1)
  })

  it('starts with elapsed and pixelCount watched by default', () => {
    expect(usePreviewStore.getState().watchedBuiltins).toEqual(['elapsed', 'pixelCount'])
    expect(usePreviewStore.getState().watchedPatternVars).toEqual([])
  })

  it('setWatchedBuiltins replaces the list', () => {
    usePreviewStore.getState().setWatchedBuiltins(['delta', 'energyAverage'])
    expect(usePreviewStore.getState().watchedBuiltins).toEqual(['delta', 'energyAverage'])
  })

  it('setWatchedPatternVars replaces the list', () => {
    usePreviewStore.getState().setWatchedPatternVars(['t', 'width'])
    expect(usePreviewStore.getState().watchedPatternVars).toEqual(['t', 'width'])
  })

  it('setWatchValues updates watch values', () => {
    usePreviewStore.getState().setWatchValues({ delta: 16.7, t: 0.42 })
    expect(usePreviewStore.getState().watchValues).toEqual({ delta: 16.7, t: 0.42 })
  })
})

describe('mergePersistedPreview', () => {
  it('fills in a missing grid field from defaults (pre-rename persisted state)', () => {
    const current = usePreviewStore.getState()
    // Simulate a blob saved before `diffusion` existed (had `glowAmount` instead)
    const persisted = { grid: { rows: 8, cols: 8, spacing: 20, glowAmount: 8 } }
    const merged = mergePersistedPreview(persisted, current)
    expect(merged.grid.diffusion).toBe(previewInitialState.grid.diffusion)
    expect(merged.grid.rows).toBe(8)
    expect(merged.grid.cols).toBe(8)
  })

  it('preserves a persisted diffusion value', () => {
    const current = usePreviewStore.getState()
    const persisted = { grid: { rows: 16, cols: 16, spacing: 20, diffusion: 0.6 } }
    expect(mergePersistedPreview(persisted, current).grid.diffusion).toBe(0.6)
  })

  it('clamps an oversized persisted grid to 256 on load', () => {
    const current = usePreviewStore.getState()
    const persisted = { grid: { rows: 999999, cols: 500, spacing: 20, diffusion: 0.5 } }
    const merged = mergePersistedPreview(persisted, current)
    expect(merged.grid.rows).toBe(256)
    expect(merged.grid.cols).toBe(256)
  })
})
