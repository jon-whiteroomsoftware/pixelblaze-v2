// Guards the bench's load-bearing property: the checksum is deterministic for
// identical code and moves the moment the visual changes. (The timing numbers
// are inherently machine-dependent, so they're not asserted — only that they're
// finite and positive.)
import { benchOne, benchDemo, compareVisualDrift } from './benchCore'
import { LIBRARIES } from '../../src/pixelblaze/libs'

// A tiny self-contained 2D demo — no library deps, animates over the clock.
const SRC = `
export var speed = 0.5
export function sliderSpeed(v) { speed = v }
export function render2D(index, x, y) {
  hsv(x + time(0.1), 1, y)
}
`

describe('benchCore', () => {
  it('produces a deterministic checksum for identical code', () => {
    const a = benchOne(SRC, LIBRARIES, 'fast', { frames: 5, warmup: 1 })
    const b = benchOne(SRC, LIBRARIES, 'fast', { frames: 5, warmup: 1 })
    expect(a.checksum).toBe(b.checksum)
  })

  it('changes the checksum when the visual changes', () => {
    const base = benchOne(SRC, LIBRARIES, 'fast', { frames: 5, warmup: 1 })
    const edited = benchOne(SRC.replace('hsv(x', 'hsv(y'), LIBRARIES, 'fast', { frames: 5, warmup: 1 })
    expect(edited.checksum).not.toBe(base.checksum)
  })

  it('reports zero visual drift for identical code', () => {
    const drift = compareVisualDrift(SRC, SRC, LIBRARIES, 'fast', { frames: 5, warmup: 1 })
    expect(drift.meanAbs).toBe(0)
    expect(drift.rmse).toBe(0)
    expect(drift.p95).toBe(0)
    expect(drift.max).toBe(0)
    expect(drift.changedPct).toBe(0)
  })

  it('quantifies bounded visual drift for a small brightness change', () => {
    const edited = SRC.replace('hsv(x + time(0.1), 1, y)', 'hsv(x + time(0.1), 1, y * 0.9)')
    const drift = compareVisualDrift(SRC, edited, LIBRARIES, 'fast', { frames: 5, warmup: 1, threshold: 2 })
    expect(drift.meanAbs).toBeGreaterThan(0)
    expect(drift.rmse).toBeGreaterThan(drift.meanAbs)
    expect(drift.max).toBeLessThanOrEqual(26)
    expect(drift.changedPct).toBeGreaterThan(0)
    expect(drift.base.checksum).not.toBe(drift.candidate.checksum)
  })

  it('reports finite, positive frame times in both modes', () => {
    const { fast, precise } = benchDemo(SRC, LIBRARIES, { frames: 5, warmup: 1 })
    for (const r of [fast, precise]) {
      expect(r.meanFrameMs).toBeGreaterThan(0)
      expect(Number.isFinite(r.meanFrameMs)).toBe(true)
      expect(r.pixelCount).toBeGreaterThan(0)
    }
  })

  it('picks the render grid from the demo dimensionality', () => {
    const r2d = benchOne(SRC, LIBRARIES, 'fast', { frames: 1, warmup: 0 })
    expect(r2d.dimension).toBe(2)

    const src1d = 'export function render(index) { hsv(index / pixelCount, 1, 1) }'
    const r1d = benchOne(src1d, LIBRARIES, 'fast', { frames: 1, warmup: 0 })
    expect(r1d.dimension).toBe(1)
  })

  it('honours an explicit grid override', () => {
    const r = benchOne(SRC, LIBRARIES, 'fast', { frames: 1, warmup: 0, grid: { rows: 8, cols: 8 } })
    expect(r.pixelCount).toBe(64)
  })
})
