import { describe, it, expect } from 'vitest'
import { createShim } from './shim'

const defaultGrid = { rows: 8, cols: 8 }

function makeShim(getVirtualTime: () => number = () => 0) {
  return createShim({ grid: defaultGrid, getVirtualTime })
}

// ── hsv ─────────────────────────────────────────────────────────────────────

describe('hsv', () => {
  it('captures pure red for h=0', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(0, 1, 1)
    expect(capturedPixel()).toEqual([1, 0, 0])
  })

  it('captures pure green for h=1/3', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(1 / 3, 1, 1)
    const [r, g, b] = capturedPixel()
    expect(r).toBeCloseTo(0)
    expect(g).toBeCloseTo(1)
    expect(b).toBeCloseTo(0)
  })

  it('captures white for zero saturation', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(0, 0, 1)
    expect(capturedPixel()).toEqual([1, 1, 1])
  })

  it('resets to black after capturedPixel is called', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(0, 1, 1)
    capturedPixel()
    expect(capturedPixel()).toEqual([0, 0, 0])
  })
})

// ── rgb ─────────────────────────────────────────────────────────────────────

describe('rgb', () => {
  it('captures color directly', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.rgb as (r: number, g: number, b: number) => void)(0.5, 0.3, 0.7)
    expect(capturedPixel()).toEqual([0.5, 0.3, 0.7])
  })
})

// ── time ────────────────────────────────────────────────────────────────────

describe('time', () => {
  it('returns 0.5 when virtual time is half the period', () => {
    const { builtins } = createShim({ grid: defaultGrid, getVirtualTime: () => 32768 })
    expect((builtins.time as (i: number) => number)(1)).toBeCloseTo(0.5)
  })

  it('wraps to 0 at a full period', () => {
    const { builtins } = createShim({ grid: defaultGrid, getVirtualTime: () => 65536 })
    expect((builtins.time as (i: number) => number)(1)).toBeCloseTo(0)
  })
})

// ── wave ────────────────────────────────────────────────────────────────────

describe('wave', () => {
  it('returns 0 at v=0', () => {
    const { builtins } = makeShim()
    expect((builtins.wave as (v: number) => number)(0)).toBeCloseTo(0)
  })

  it('returns 1 at v=0.5', () => {
    const { builtins } = makeShim()
    expect((builtins.wave as (v: number) => number)(0.5)).toBeCloseTo(1)
  })
})

// ── triangle ────────────────────────────────────────────────────────────────

describe('triangle', () => {
  it('returns 0 at v=0', () => {
    const { builtins } = makeShim()
    expect((builtins.triangle as (v: number) => number)(0)).toBeCloseTo(0)
  })

  it('returns 1 at v=0.5', () => {
    const { builtins } = makeShim()
    expect((builtins.triangle as (v: number) => number)(0.5)).toBeCloseTo(1)
  })

  it('returns 0 at v=1', () => {
    const { builtins } = makeShim()
    expect((builtins.triangle as (v: number) => number)(1)).toBeCloseTo(0)
  })
})

// ── clamp ───────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('clamps below minimum', () => {
    const { builtins } = makeShim()
    expect((builtins.clamp as (v: number, lo: number, hi: number) => number)(-1, 0, 1)).toBe(0)
  })

  it('clamps above maximum', () => {
    const { builtins } = makeShim()
    expect((builtins.clamp as (v: number, lo: number, hi: number) => number)(2, 0, 1)).toBe(1)
  })

  it('passes through values in range', () => {
    const { builtins } = makeShim()
    expect((builtins.clamp as (v: number, lo: number, hi: number) => number)(0.4, 0, 1)).toBe(0.4)
  })
})

// ── map ─────────────────────────────────────────────────────────────────────

describe('map', () => {
  it('maps midpoint linearly', () => {
    const { builtins } = makeShim()
    const mapFn = builtins.map as (v: number, fl: number, fh: number, tl: number, th: number) => number
    expect(mapFn(5, 0, 10, 100, 200)).toBeCloseTo(150)
  })
})

// ── pixelCount ───────────────────────────────────────────────────────────────

describe('pixelCount', () => {
  it('equals rows * cols from grid config', () => {
    const { builtins } = createShim({ grid: { rows: 4, cols: 8 }, getVirtualTime: () => 0 })
    expect(builtins.pixelCount).toBe(32)
  })
})

// ── array ────────────────────────────────────────────────────────────────────

describe('array', () => {
  it('returns a native JS array of n zeros', () => {
    const { builtins } = makeShim()
    const result = (builtins.array as (n: number) => number[])(5)
    expect(result).toHaveLength(5)
    expect(result).toEqual([0, 0, 0, 0, 0])
  })
})

// ── hardware stubs ───────────────────────────────────────────────────────────

describe('hardware stubs', () => {
  it('analogRead is callable and returns 0', () => {
    const { builtins } = makeShim()
    expect((builtins.analogRead as () => number)()).toBe(0)
  })

  it('digitalWrite is callable without throwing', () => {
    const { builtins } = makeShim()
    expect(() => (builtins.digitalWrite as (p: number, v: number) => void)(1, 1)).not.toThrow()
  })

  it('sensor globals are defined as zero defaults', () => {
    const { builtins } = makeShim()
    expect(builtins.energyAverage).toBe(0)
    expect(builtins.nodeId).toBe(0)
    expect(Array.isArray(builtins.frequencyData)).toBe(true)
  })

  it('coordinate transform stubs are callable without throwing', () => {
    const { builtins } = makeShim()
    expect(() => (builtins.resetTransform as () => void)()).not.toThrow()
    expect(() => (builtins.translate as (x: number, y: number) => void)(1, 2)).not.toThrow()
  })
})

// ── setPalette / paint ───────────────────────────────────────────────────────

describe('setPalette / paint', () => {
  it('paint after setPalette captures a non-black color', () => {
    const { builtins, capturedPixel } = makeShim()
    // palette: pos=0 → red (255,0,0), pos=255 → blue (0,0,255)
    ;(builtins.setPalette as (p: number[]) => void)([0, 255, 0, 0, 255, 0, 0, 255])
    ;(builtins.paint as (pos: number) => void)(0)
    const [r] = capturedPixel()
    expect(r).toBeCloseTo(1)
  })

  it('paint without palette does not throw', () => {
    const { builtins } = makeShim()
    expect(() => (builtins.paint as (pos: number) => void)(0.5)).not.toThrow()
  })
})
