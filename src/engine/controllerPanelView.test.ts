import { describe, it, expect } from 'vitest'
import {
  describeControllerPanel,
  resolveActiveProgramName,
  shapeControllerControls,
  controllerSliderValue,
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

  it('resolves a run-only program from the local label cache and flags it unsaved', () => {
    const view = describeControllerPanel({
      activeProgramId: 'throwaway1',
      programs,
      programLabels: { throwaway1: 'My Sketch' },
      fps: null,
    })
    expect(view.patternName).toBe('My Sketch')
    expect(view.patternUnsaved).toBe(true)
  })

  it('prefers the device program list over the label cache (a saved program is not unsaved)', () => {
    const view = describeControllerPanel({
      activeProgramId: 'def',
      programs,
      programLabels: { def: 'Stale Name' },
      fps: null,
    })
    expect(view.patternName).toBe('Nebula')
    expect(view.patternUnsaved).toBe(false)
  })

  it('does not mark a list-resolved or raw-id name as unsaved', () => {
    expect(describeControllerPanel({ activeProgramId: 'def', programs, fps: null }).patternUnsaved).toBe(false)
    expect(describeControllerPanel({ activeProgramId: 'ghost', programs, fps: null }).patternUnsaved).toBe(false)
  })
})

describe('resolveActiveProgramName', () => {
  it('resolves through the program list first (saved, not unsaved)', () => {
    expect(resolveActiveProgramName('abc', programs, { abc: 'cached' })).toEqual({
      patternName: 'Aurora',
      patternUnsaved: false,
    })
  })

  it('falls to the label cache when the list misses (unsaved)', () => {
    expect(resolveActiveProgramName('zzz', programs, { zzz: 'Run Only' })).toEqual({
      patternName: 'Run Only',
      patternUnsaved: true,
    })
  })

  it('falls to the raw id when neither resolves', () => {
    expect(resolveActiveProgramName('zzz', programs, {})).toEqual({
      patternName: 'zzz',
      patternUnsaved: false,
    })
  })

  it('returns the placeholder when no program is active', () => {
    expect(resolveActiveProgramName(undefined, programs)).toEqual({
      patternName: '—',
      patternUnsaved: false,
    })
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

  it('renders the pixel count as an integer string', () => {
    expect(describeControllerPanel({ programs, fps: null, pixelCount: 256 }).pixelsLabel).toBe('256')
  })

  it('shows an em-dash placeholder when pixel count has not been read', () => {
    expect(describeControllerPanel({ programs, fps: null }).pixelsLabel).toBe('—')
  })

  it('renders the installed-map point count as an integer string', () => {
    expect(
      describeControllerPanel({ programs, fps: null, mapPointCount: 16 }).mapPointsLabel,
    ).toBe('16')
  })

  it('shows an em-dash placeholder when the map point count has not been read', () => {
    expect(describeControllerPanel({ programs, fps: null }).mapPointsLabel).toBe('—')
  })

  it('flags a mismatch when map points and pixel count are both known and disagree', () => {
    expect(
      describeControllerPanel({ programs, fps: null, pixelCount: 256, mapPointCount: 16 })
        .mapCountMismatch,
    ).toBe(true)
  })

  it('does not flag a mismatch when the counts match', () => {
    expect(
      describeControllerPanel({ programs, fps: null, pixelCount: 16, mapPointCount: 16 })
        .mapCountMismatch,
    ).toBe(false)
  })

  it('does not flag a mismatch when either count is unknown', () => {
    expect(
      describeControllerPanel({ programs, fps: null, pixelCount: 256 }).mapCountMismatch,
    ).toBe(false)
    expect(
      describeControllerPanel({ programs, fps: null, mapPointCount: 16 }).mapCountMismatch,
    ).toBe(false)
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

describe('controllerSliderValue', () => {
  it('passes through an in-range 0..1 value', () => {
    expect(controllerSliderValue(0)).toBe(0)
    expect(controllerSliderValue(0.67)).toBe(0.67)
    expect(controllerSliderValue(1)).toBe(1)
  })

  it('returns null for the drifted out-of-range values the device reports', () => {
    // The real values seen on hardware for run-only patterns (#speed-slider).
    expect(controllerSliderValue(2.368264e21)).toBeNull()
    expect(controllerSliderValue(1.984327)).toBeNull()
    expect(controllerSliderValue(-1.554502e-15)).toBeNull()
  })

  it('returns null for non-finite values', () => {
    expect(controllerSliderValue(NaN)).toBeNull()
    expect(controllerSliderValue(Infinity)).toBeNull()
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
