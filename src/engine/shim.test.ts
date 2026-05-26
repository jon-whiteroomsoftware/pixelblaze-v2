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
  it('returns an array of n zeros', () => {
    const { builtins } = makeShim()
    const result = (builtins.array as (n: number) => number[])(5)
    expect(result).toHaveLength(5)
    expect(result).toEqual([0, 0, 0, 0, 0])
  })

  it('floors a float size argument', () => {
    const { builtins } = makeShim()
    const result = (builtins.array as (n: number) => number[])(3.9)
    expect(result).toHaveLength(3)
  })

  it('reads with a float index by flooring it', () => {
    const { builtins } = makeShim()
    const arr = (builtins.array as (n: number) => number[])(5)
    arr[2] = 99
    expect(arr[2.7]).toBe(99)
  })

  it('writes with a float index by flooring it', () => {
    const { builtins } = makeShim()
    const arr = (builtins.array as (n: number) => number[])(5)
    arr[2.9] = 42
    expect(arr[2]).toBe(42)
  })

  it('stores sub-arrays created by array() and accesses them with float indices', () => {
    const { builtins } = makeShim()
    const arrayFn = builtins.array as (n: number) => unknown[]
    const outer = arrayFn(3)
    outer[0] = arrayFn(4)
    ;(outer[0] as number[])[1] = 7
    expect((outer[0.4] as number[])[1.8]).toBe(7)
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
    expect(Array.isArray(builtins.frequencyData)).toBe(true)
  })

  it('nodeId is a function returning 0', () => {
    const { builtins } = makeShim()
    expect((builtins.nodeId as () => number)()).toBe(0)
  })

  it('coordinate transform stubs are callable without throwing', () => {
    const { builtins } = makeShim()
    expect(() => (builtins.resetTransform as () => void)()).not.toThrow()
    expect(() => (builtins.translate as (x: number, y: number) => void)(1, 2)).not.toThrow()
  })
})

// ── coordinate transforms ─────────────────────────────────────────────────────

describe('coordinate transforms', () => {
  const fn = (builtins: Record<string, unknown>, name: string) =>
    builtins[name] as (...args: number[]) => void

  it('identity transform leaves points unchanged', () => {
    const { transformPoint } = makeShim()
    expect(transformPoint(0.3, 0.7, 0)).toEqual([0.3, 0.7, 0])
  })

  it('translate offsets the point', () => {
    const { builtins, transformPoint } = makeShim()
    fn(builtins, 'translate')(0.1, 0.2)
    const [x, y] = transformPoint(0.5, 0.5, 0)
    expect(x).toBeCloseTo(0.6)
    expect(y).toBeCloseTo(0.7)
  })

  it('scale multiplies coordinates (so shapes appear smaller)', () => {
    const { builtins, transformPoint } = makeShim()
    fn(builtins, 'scale')(2, 2)
    const [x, y] = transformPoint(0.25, 0.25, 0)
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.5)
  })

  it('rotate turns the point about the origin', () => {
    const { builtins, transformPoint } = makeShim()
    fn(builtins, 'rotate')(Math.PI / 2)
    const [x, y] = transformPoint(1, 0, 0)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(1)
  })

  it('composes transforms in call order: rotate about a centre', () => {
    const { builtins, transformPoint } = makeShim()
    // classic centre-rotation idiom; a 180° turn about (0.5,0.5)
    fn(builtins, 'translate')(-0.5, -0.5)
    fn(builtins, 'rotate')(Math.PI)
    fn(builtins, 'translate')(0.5, 0.5)
    const [x, y] = transformPoint(0.5, 0.5, 0) // centre maps to itself
    expect(x).toBeCloseTo(0.5)
    expect(y).toBeCloseTo(0.5)
    const [x2, y2] = transformPoint(1, 1, 0) // corner reflects to (0,0)
    expect(x2).toBeCloseTo(0)
    expect(y2).toBeCloseTo(0)
  })

  it('resetTransform clears accumulated transforms', () => {
    const { builtins, transformPoint } = makeShim()
    fn(builtins, 'translate')(0.3, 0.3)
    fn(builtins, 'resetTransform')()
    expect(transformPoint(0.4, 0.6, 0)).toEqual([0.4, 0.6, 0])
  })

  it('transform() applies a column-major 4x4 matrix (translation column)', () => {
    const { builtins, transformPoint } = makeShim()
    // identity rotation/scale with translation (0.2, 0.4, 0) in the 4th column
    fn(builtins, 'transform')(
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0.2, 0.4, 0, 1,
    )
    const [x, y] = transformPoint(0.1, 0.1, 0)
    expect(x).toBeCloseTo(0.3)
    expect(y).toBeCloseTo(0.5)
  })
})

// ── pixel map queries ─────────────────────────────────────────────────────────

describe('pixel map queries', () => {
  it('has2DMap, has3DMap and pixelMapDimensions are callable functions', () => {
    const { builtins } = makeShim()
    expect((builtins.has2DMap as () => boolean)()).toBe(true)
    expect((builtins.has3DMap as () => boolean)()).toBe(false)
    expect((builtins.pixelMapDimensions as () => number)()).toBe(2)
  })
})

// ── hsv24 ─────────────────────────────────────────────────────────────────────

describe('hsv24', () => {
  it('captures the same color as hsv for matching h, s, v', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv24 as (h: number, s: number, v: number) => void)(0, 1, 1)
    expect(capturedPixel()).toEqual([1, 0, 0])
  })
})

// ── setPalette / paint ───────────────────────────────────────────────────────

describe('setPalette / paint', () => {
  it('paint after setPalette captures the stop color (0..1 convention)', () => {
    const { builtins, capturedPixel } = makeShim()
    // palette: pos=0 → red (1,0,0), pos=1 → blue (0,0,1)
    ;(builtins.setPalette as (p: number[]) => void)([0, 1, 0, 0, 1, 0, 0, 1])
    ;(builtins.paint as (pos: number) => void)(0)
    expect(capturedPixel()).toEqual([1, 0, 0])
  })

  it('paint interpolates between stops at the midpoint', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.setPalette as (p: number[]) => void)([0, 1, 0, 0, 1, 0, 0, 1])
    ;(builtins.paint as (pos: number) => void)(0.5)
    const [r, g, b] = capturedPixel()
    expect(r).toBeCloseTo(0.5)
    expect(g).toBeCloseTo(0)
    expect(b).toBeCloseTo(0.5)
  })

  it('paint applies brightness scaling', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.setPalette as (p: number[]) => void)([0, 1, 0, 0, 1, 0, 0, 1])
    ;(builtins.paint as (pos: number, b: number) => void)(0, 0.5)
    expect(capturedPixel()).toEqual([0.5, 0, 0])
  })

  it('paint holds the last stop color beyond its position', () => {
    const { builtins, capturedPixel } = makeShim()
    // last stop at 0.75 → magenta; querying 0.9 should hold magenta
    ;(builtins.setPalette as (p: number[]) => void)([0, 0, 0, 0, 0.75, 1, 0, 1])
    ;(builtins.paint as (pos: number) => void)(0.9)
    expect(capturedPixel()).toEqual([1, 0, 1])
  })

  it('paint without palette does not throw', () => {
    const { builtins } = makeShim()
    expect(() => (builtins.paint as (pos: number) => void)(0.5)).not.toThrow()
  })
})

// ── math additions ────────────────────────────────────────────────────────────

describe('frac', () => {
  it('returns the fractional part of a positive number', () => {
    const { builtins } = makeShim()
    expect((builtins.frac as (v: number) => number)(5.5)).toBeCloseTo(0.5)
  })
  it('returns negative fractional part for negative numbers (truncation-based)', () => {
    const { builtins } = makeShim()
    expect((builtins.frac as (v: number) => number)(-5.5)).toBeCloseTo(-0.5)
  })
})

describe('mod', () => {
  it('matches JS % for positive operands', () => {
    const { builtins } = makeShim()
    expect((builtins.mod as (x: number, y: number) => number)(7, 3)).toBeCloseTo(1)
  })
  it('uses floored division so result has sign of y (mod(-3.5, 3) == 2.5)', () => {
    const { builtins } = makeShim()
    expect((builtins.mod as (x: number, y: number) => number)(-3.5, 3)).toBeCloseTo(2.5)
  })
})

describe('smoothstep', () => {
  it('returns 0 below lo', () => {
    const { builtins } = makeShim()
    expect((builtins.smoothstep as (lo: number, hi: number, v: number) => number)(0.2, 0.8, 0)).toBe(0)
  })
  it('returns 1 above hi', () => {
    const { builtins } = makeShim()
    expect((builtins.smoothstep as (lo: number, hi: number, v: number) => number)(0.2, 0.8, 1)).toBe(1)
  })
  it('returns 0.5 at midpoint', () => {
    const { builtins } = makeShim()
    expect((builtins.smoothstep as (lo: number, hi: number, v: number) => number)(0, 1, 0.5)).toBeCloseTo(0.5)
  })
})

describe('mix', () => {
  it('interpolates linearly', () => {
    const { builtins } = makeShim()
    expect((builtins.mix as (lo: number, hi: number, w: number) => number)(0, 10, 0.3)).toBeCloseTo(3)
  })
})

describe('bezierQuadratic', () => {
  it('returns p0 at t=0 and p2 at t=1', () => {
    const { builtins } = makeShim()
    const bq = builtins.bezierQuadratic as (t: number, p0: number, p1: number, p2: number) => number
    expect(bq(0, 1, 5, 3)).toBeCloseTo(1)
    expect(bq(1, 1, 5, 3)).toBeCloseTo(3)
  })
})

describe('bezierCubic', () => {
  it('returns p0 at t=0 and p3 at t=1', () => {
    const { builtins } = makeShim()
    const bc = builtins.bezierCubic as (t: number, p0: number, p1: number, p2: number, p3: number) => number
    expect(bc(0, 1, 5, 7, 4)).toBeCloseTo(1)
    expect(bc(1, 1, 5, 7, 4)).toBeCloseTo(4)
  })
})

describe('prng / prngSeed', () => {
  it('produces the same sequence for the same seed', () => {
    const { builtins } = makeShim()
    const prng = builtins.prng as (max: number) => number
    const seed = builtins.prngSeed as (s: number) => number
    seed(42)
    const a = [prng(1), prng(1), prng(1)]
    seed(42)
    const b = [prng(1), prng(1), prng(1)]
    expect(a).toEqual(b)
  })
  it('returns values in [0, max)', () => {
    const { builtins } = makeShim()
    const prng = builtins.prng as (max: number) => number
    for (let i = 0; i < 20; i++) {
      const v = prng(5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
    }
  })
})

interface PbArray extends Array<number> {
  sum(): number
  mutate(fn: (v: number, i: number, a: number[]) => number): PbArray
}

function pbArr(builtins: Record<string, unknown>, n: number): PbArray {
  return (builtins.array as (n: number) => PbArray)(n)
}

describe('array methods', () => {
  it('sum() returns the sum of all elements', () => {
    const { builtins } = makeShim()
    const a = pbArr(builtins, 3)
    a[0] = 1; a[1] = 2; a[2] = 3
    expect(a.sum()).toBe(6)
  })
  it('mutate() applies fn in place', () => {
    const { builtins } = makeShim()
    const a = pbArr(builtins, 3)
    a[0] = 1; a[1] = 2; a[2] = 3
    a.mutate((v: number) => v * 2)
    expect([a[0], a[1], a[2]]).toEqual([2, 4, 6])
  })
  it('sort() sorts numerically (not lexicographically)', () => {
    const { builtins } = makeShim()
    const a = pbArr(builtins, 3)
    a[0] = 10; a[1] = 9; a[2] = 2
    a.sort()
    expect([a[0], a[1], a[2]]).toEqual([2, 9, 10])
  })
})

describe('arraySum (standalone)', () => {
  it('returns the sum', () => {
    const { builtins } = makeShim()
    const a = (builtins.array as (n: number) => number[])(3)
    a[0] = 4; a[1] = 5; a[2] = 6
    expect((builtins.arraySum as (a: number[]) => number)(a)).toBe(15)
  })
})

// ── Perlin noise ─────────────────────────────────────────────────────────────

describe('perlin', () => {
  it('returns a value in [0, 1]', () => {
    const { builtins } = makeShim()
    const p = builtins.perlin as (x: number, y: number, z: number, seed: number) => number
    for (let i = 0; i < 20; i++) {
      const v = p(Math.random() * 100, Math.random() * 100, Math.random() * 100, 0)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic', () => {
    const { builtins } = makeShim()
    const p = builtins.perlin as (x: number, y: number, z: number, seed: number) => number
    expect(p(1.5, 2.3, 0.7, 0)).toBe(p(1.5, 2.3, 0.7, 0))
  })

  it('different seeds produce different values', () => {
    const { builtins } = makeShim()
    const p = builtins.perlin as (x: number, y: number, z: number, seed: number) => number
    expect(p(1.5, 2.3, 0.7, 0)).not.toBe(p(1.5, 2.3, 0.7, 7))
  })

  it('nearby points are similar (continuity)', () => {
    const { builtins } = makeShim()
    const p = builtins.perlin as (x: number, y: number, z: number, seed: number) => number
    const a = p(1.0, 1.0, 1.0, 0)
    const b = p(1.001, 1.0, 1.0, 0)
    expect(Math.abs(a - b)).toBeLessThan(0.01)
  })

  it('wraps seamlessly at the period set by setPerlinWrap', () => {
    const { builtins } = makeShim()
    const p = builtins.perlin as (x: number, y: number, z: number, seed: number) => number
    const wrap = builtins.setPerlinWrap as (x: number, y: number, z: number) => void
    wrap(4, 4, 4)
    // x=0 and x=4 should be the same sample
    expect(p(0, 0.5, 0.5, 0)).toBeCloseTo(p(4, 0.5, 0.5, 0), 10)
  })
})

describe('perlinFbm', () => {
  it('returns a value in [0, 1]', () => {
    const { builtins } = makeShim()
    const f = builtins.perlinFbm as (x: number, y: number, z: number, lac: number, gain: number, oct: number) => number
    for (let i = 0; i < 20; i++) {
      const v = f(Math.random() * 10, Math.random() * 10, Math.random() * 10, 2, 0.5, 4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('perlinTurbulence', () => {
  it('returns a value in [0, 1]', () => {
    const { builtins } = makeShim()
    const t = builtins.perlinTurbulence as (x: number, y: number, z: number, lac: number, gain: number, oct: number) => number
    for (let i = 0; i < 20; i++) {
      const v = t(Math.random() * 10, Math.random() * 10, Math.random() * 10, 2, 0.5, 4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('perlinRidge', () => {
  it('returns a value in [0, 1]', () => {
    const { builtins } = makeShim()
    const r = builtins.perlinRidge as (x: number, y: number, z: number, lac: number, gain: number, offset: number, oct: number) => number
    for (let i = 0; i < 20; i++) {
      const v = r(Math.random() * 10, Math.random() * 10, Math.random() * 10, 2, 0.5, 1, 4)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

// ── hypot ─────────────────────────────────────────────────────────────────────

describe('hypot', () => {
  it('returns the Euclidean distance for a 3-4-5 triangle', () => {
    const { builtins } = makeShim()
    expect((builtins.hypot as (x: number, y: number) => number)(3, 4)).toBeCloseTo(5)
  })
})
