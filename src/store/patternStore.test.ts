import { describe, it, expect, beforeEach } from 'vitest'
import { usePatternStore, patternInitialState } from './patternStore'

beforeEach(() => {
  usePatternStore.setState(patternInitialState)
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

describe('updatePatternLayout', () => {
  it('merges the layout selection onto the in-memory record', async () => {
    usePatternStore.setState({
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1 }],
    })
    await usePatternStore.getState().updatePatternLayout('p1', {
      shapeId: 'ring',
      pixelCount: 64,
    })
    const rec = usePatternStore.getState().userPatterns[0]
    expect(rec).toMatchObject({ id: 'p1', shapeId: 'ring', pixelCount: 64 })
  })
})
