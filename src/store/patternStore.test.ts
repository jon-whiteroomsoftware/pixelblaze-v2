import { describe, it, expect, beforeEach } from 'vitest'
import { usePatternStore, patternInitialState, activePushKey } from './patternStore'

beforeEach(() => {
  usePatternStore.setState(patternInitialState)
})

describe('activePushKey', () => {
  it('keys a user pattern by its record id', () => {
    expect(activePushKey({ activePatternId: 'abc-123', activeDemoName: null })).toBe('abc-123')
  })

  it('keys a demo by a `demo:` namespaced name (so it pushes without forking)', () => {
    expect(activePushKey({ activePatternId: null, activeDemoName: 'Test Pattern (2D)' })).toBe(
      'demo:Test Pattern (2D)',
    )
  })

  it('prefers the user pattern id when both are somehow set', () => {
    expect(activePushKey({ activePatternId: 'abc-123', activeDemoName: 'X' })).toBe('abc-123')
  })

  it('is null when nothing pushable is open (e.g. a library)', () => {
    expect(activePushKey({ activePatternId: null, activeDemoName: null })).toBeNull()
  })
})

describe('patternStore', () => {
  it('starts with no pattern selected', () => {
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })

  it('setActivePattern updates activePatternId', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    expect(usePatternStore.getState().activePatternId).toBe('abc-123')
  })

  it('setActivePattern can clear selection', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    usePatternStore.getState().setActivePattern(null)
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })

  it('setActivePattern clears activeLibraryName', () => {
    usePatternStore.getState().setActiveLibrary('sdf')
    usePatternStore.getState().setActivePattern('abc-123')
    expect(usePatternStore.getState().activeLibraryName).toBeNull()
  })

  it('setActiveLibrary clears activePatternId', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    usePatternStore.getState().setActiveLibrary('sdf')
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })
})

describe('updatePatternSettings', () => {
  beforeEach(() => {
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 }],
    })
  })

  it('sparse-merges overrides into the record settings bag', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { shapeId: 'ring', pixelCount: 64 })
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ shapeId: 'ring', pixelCount: 64 })
  })

  it('accumulates across calls without dropping earlier fields', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { shapeId: 'ring' })
    await usePatternStore.getState().updatePatternSettings('p1', { brightness: 0.5 })
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ shapeId: 'ring', brightness: 0.5 })
  })

  it('does not bump updatedAt (settings are display-side, not a code edit)', async () => {
    await usePatternStore.getState().updatePatternSettings('p1', { brightness: 0.5 })
    expect(usePatternStore.getState().userPatterns[0].updatedAt).toBe(1)
  })
})

describe('resetPatternSettings', () => {
  it('clears the record settings bag', async () => {
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings: { brightness: 0.5 } }],
    })
    await usePatternStore.getState().resetPatternSettings('p1')
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({})
  })
})

describe('demo overrides', () => {
  it('updateDemoSettings sparse-merges per demo name', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { pixelCount: 256 })
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({
      brightness: 0.5,
      pixelCount: 256,
    })
  })

  it('keeps each demo bag independent', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('NebulaSphere', { brightness: 0.2 })
    expect(usePatternStore.getState().demoOverrides).toEqual({
      AuroraSphere: { brightness: 0.5 },
      NebulaSphere: { brightness: 0.2 },
    })
  })

  it('resetDemoSettings drops only that demo bag', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    await usePatternStore.getState().updateDemoSettings('NebulaSphere', { brightness: 0.2 })
    await usePatternStore.getState().resetDemoSettings('AuroraSphere')
    expect(usePatternStore.getState().demoOverrides).toEqual({ NebulaSphere: { brightness: 0.2 } })
  })

  it('loadDemoOverrides rehydrates the persisted map', async () => {
    await usePatternStore.getState().updateDemoSettings('AuroraSphere', { brightness: 0.5 })
    usePatternStore.setState({ demoOverrides: {} })
    await usePatternStore.getState().loadDemoOverrides()
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({ brightness: 0.5 })
  })
})
