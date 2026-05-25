import { describe, it, expect, beforeEach } from 'vitest'
import { usePreviewStore, previewInitialState } from './previewStore'

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
    expect(grid.rows).toBe(16)
    expect(grid.cols).toBe(16)
    expect(grid.spacing).toBe(20)
    expect(grid.diffusion).toBe(0)
  })

  it('setGrid merges partial grid updates', () => {
    usePreviewStore.getState().setGrid({ rows: 8 })
    const { grid } = usePreviewStore.getState()
    expect(grid.rows).toBe(8)
    expect(grid.cols).toBe(16)
  })

  it('starts with delta and pixelCount watched by default', () => {
    expect(usePreviewStore.getState().watchedBuiltins).toEqual(['delta', 'pixelCount'])
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
