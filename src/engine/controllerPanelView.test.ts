import { describe, it, expect } from 'vitest'
import {
  describeControllerPanel,
  shapeControllerControls,
  describeControllerVars,
} from './controllerPanelView'

const programs = [
  { id: 'abc', name: 'Aurora' },
  { id: 'def', name: 'Nebula' },
]

describe('describeControllerPanel', () => {
  it('resolves the active pattern name from the program list', () => {
    const view = describeControllerPanel({ activeProgramId: 'def', programs, fps: 42 })
    expect(view.patternName).toBe('Nebula')
  })

  it('falls back to the raw id when no program matches', () => {
    const view = describeControllerPanel({ activeProgramId: 'ghost', programs, fps: null })
    expect(view.patternName).toBe('ghost')
  })

  it('shows an em-dash placeholder when no pattern is active', () => {
    const view = describeControllerPanel({ activeProgramId: undefined, programs, fps: null })
    expect(view.patternName).toBe('—')
  })

  it('formats fps to one decimal', () => {
    expect(describeControllerPanel({ programs, fps: 59.94 }).fpsLabel).toBe('59.9')
  })

  it('shows an em-dash placeholder when fps has not been reported', () => {
    expect(describeControllerPanel({ programs, fps: null }).fpsLabel).toBe('—')
  })
})

describe('shapeControllerControls', () => {
  it('returns an empty list when there are no controls', () => {
    expect(shapeControllerControls(undefined)).toEqual([])
    expect(shapeControllerControls({})).toEqual([])
  })

  it('recovers kind and label from the name prefix', () => {
    const controls = shapeControllerControls({ sliderSpeed: 0.3, toggleMirror: 1 })
    expect(controls).toEqual([
      { name: 'sliderSpeed', label: 'Speed', kind: 'slider', value: 0.3 },
      { name: 'toggleMirror', label: 'Mirror', kind: 'toggle', value: 1 },
    ])
  })

  it('degrades an unknown prefix to a slider keyed by the raw name', () => {
    expect(shapeControllerControls({ myKnob: 0.5 })).toEqual([
      { name: 'myKnob', label: 'myKnob', kind: 'slider', value: 0.5 },
    ])
  })

  it('treats picker prefixes as sliders (flat numeric map has no triplet)', () => {
    expect(shapeControllerControls({ hsvPickerColor: 0.2 })[0].kind).toBe('slider')
  })

  it('preserves the device order', () => {
    const names = shapeControllerControls({ sliderB: 0.1, sliderA: 0.2 }).map((c) => c.name)
    expect(names).toEqual(['sliderB', 'sliderA'])
  })
})

describe('describeControllerVars', () => {
  it('returns an empty list when there are no vars', () => {
    expect(describeControllerVars(undefined)).toEqual([])
    expect(describeControllerVars({})).toEqual([])
  })

  it('formats integers plainly and floats to two decimals', () => {
    expect(describeControllerVars({ count: 7, phase: 0.12345 })).toEqual([
      { name: 'count', value: '7' },
      { name: 'phase', value: '0.12' },
    ])
  })
})
