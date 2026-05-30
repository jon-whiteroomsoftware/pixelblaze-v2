import { createFxShim } from './shim'
import { fx } from './fixedpoint'

const defaultGrid = { rows: 4, cols: 4 }
const SCALE = 65536
const TOLERANCE = 1 / SCALE

function makeShim(getVirtualTime: () => number = () => 0) {
  return createFxShim({ grid: defaultGrid, getVirtualTime })
}

// ── Scalar math built-ins: raw in → raw out ───────────────────────────────────

describe('fx shim: scalar math', () => {
  it('sin(π/2) ≈ 1.0 in raw', () => {
    const { builtins } = makeShim()
    const rawArg = fx.fromFloat(Math.PI / 2)
    const result = (builtins.sin as (v: number) => number)(rawArg)
    expect(Math.abs(fx.toFloat(result) - 1.0)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('cos(0) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    expect((builtins.cos as (v: number) => number)(0)).toBe(SCALE)
  })

  it('sqrt(4.0) = 2.0 in raw', () => {
    const { builtins } = makeShim()
    const rawFour = fx.fromFloat(4)
    const result = (builtins.sqrt as (v: number) => number)(rawFour)
    expect(Math.abs(fx.toFloat(result) - 2.0)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('abs(-1.0) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    expect((builtins.abs as (v: number) => number)(fx.fromFloat(-1))).toBe(SCALE)
  })

  it('floor(1.75) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    expect((builtins.floor as (v: number) => number)(fx.fromFloat(1.75))).toBe(SCALE)
  })

  it('min(0.5, 1.0) = 0.5 in raw', () => {
    const { builtins } = makeShim()
    const result = (builtins.min as (a: number, b: number) => number)(
      fx.fromFloat(0.5), fx.fromFloat(1.0)
    )
    expect(result).toBe(fx.fromFloat(0.5))
  })

  it('max(0.5, 1.0) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    const result = (builtins.max as (a: number, b: number) => number)(
      fx.fromFloat(0.5), fx.fromFloat(1.0)
    )
    expect(result).toBe(SCALE)
  })

  it('clamp(1.5, 0, 1) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    const result = (builtins.clamp as (v: number, lo: number, hi: number) => number)(
      fx.fromFloat(1.5), 0, SCALE
    )
    expect(result).toBe(SCALE)
  })

  it('results are quantized to the 16.16 grid (Number.isInteger)', () => {
    const { builtins } = makeShim()
    const result = (builtins.sin as (v: number) => number)(fx.fromFloat(0.4))
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ── Waveform built-ins ────────────────────────────────────────────────────────

describe('fx shim: waveform built-ins', () => {
  it('wave(0) ≈ 0 in raw', () => {
    const { builtins } = makeShim()
    expect(Math.abs((builtins.wave as (v: number) => number)(0))).toBeLessThanOrEqual(1)
  })

  it('wave(0.5) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    const result = (builtins.wave as (v: number) => number)(fx.fromFloat(0.5))
    expect(Math.abs(fx.toFloat(result) - 1.0)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('triangle(0.5) = 1.0 in raw', () => {
    const { builtins } = makeShim()
    const result = (builtins.triangle as (v: number) => number)(fx.fromFloat(0.5))
    expect(Math.abs(fx.toFloat(result) - 1.0)).toBeLessThanOrEqual(TOLERANCE)
  })
})

// ── Constants pre-converted to raw ───────────────────────────────────────────

describe('fx shim: constants are raw int32', () => {
  it('PI is raw', () => {
    const { builtins } = makeShim()
    expect(builtins.PI).toBe(fx.fromFloat(Math.PI))
  })

  it('PI2 is raw', () => {
    const { builtins } = makeShim()
    expect(builtins.PI2).toBe(fx.fromFloat(Math.PI * 2))
  })

  it('E is raw', () => {
    const { builtins } = makeShim()
    expect(builtins.E).toBe(fx.fromFloat(Math.E))
  })

  it('SQRT2 is raw', () => {
    const { builtins } = makeShim()
    expect(builtins.SQRT2).toBe(fx.fromFloat(Math.SQRT2))
  })

  it('pixelCount is raw (4×4 grid → 16.0 in raw = 1048576)', () => {
    const { builtins } = makeShim()
    expect(builtins.pixelCount).toBe(fx.fromFloat(16))
  })

  it('constants are integers (on the 16.16 grid)', () => {
    const { builtins } = makeShim()
    expect(Number.isInteger(builtins.PI)).toBe(true)
    expect(Number.isInteger(builtins.PI2)).toBe(true)
  })
})

// ── Color functions: raw args, float capturedPixel ────────────────────────────

describe('fx shim: hsv captures float RGB', () => {
  it('hsv(0, 1, 1) → capturedPixel returns float [1, 0, 0]', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(0, SCALE, SCALE)
    const [r, g, b] = capturedPixel()
    expect(r).toBeCloseTo(1)
    expect(g).toBeCloseTo(0)
    expect(b).toBeCloseTo(0)
  })

  it('hsv(raw_1/3, 1, 1) → capturedPixel is approximately green', () => {
    const { builtins, capturedPixel } = makeShim()
    const h = fx.fromFloat(1 / 3)
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(h, SCALE, SCALE)
    const [r, g, b] = capturedPixel()
    expect(r).toBeCloseTo(0, 1)
    expect(g).toBeCloseTo(1, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('capturedPixel resets to [0,0,0] after each call', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.hsv as (h: number, s: number, v: number) => void)(0, SCALE, SCALE)
    capturedPixel()
    expect(capturedPixel()).toEqual([0, 0, 0])
  })

  it('rgb(raw_0.5, 0, raw_0.5) → capturedPixel returns floats ~[0.5, 0, 0.5]', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.rgb as (r: number, g: number, b: number) => void)(
      fx.fromFloat(0.5), 0, fx.fromFloat(0.5)
    )
    const [r, , b] = capturedPixel()
    expect(Math.abs(r - 0.5)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(b - 0.5)).toBeLessThanOrEqual(TOLERANCE)
  })
})

// ── setPalette / paint: palette array is raw int32, captures float RGB ────────

describe('fx shim: setPalette decodes the raw-int32 palette', () => {
  // A two-stop palette pos→r,g,b, all 0..1, as the pattern builds it: raw int32.
  const rawPalette = [
    0.0, 1.0, 0.0, 0.0, // pos 0: red
    1.0, 0.0, 0.0, 1.0, // pos 1: blue
  ].map(fx.fromFloat)

  it('paint(0) → captures the first stop as float (red), not a clamped int', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.setPalette as (p: number[]) => void)(rawPalette)
    ;(builtins.paint as (pos: number, b?: number) => void)(0)
    const [r, g, b] = capturedPixel()
    expect(Math.abs(r - 1)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(g - 0)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(b - 0)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('paint near 1 → captures close to the last stop (blue)', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.setPalette as (p: number[]) => void)(rawPalette)
    // exactly 1.0 wraps to 0 in paint(); sample just shy of the top stop.
    ;(builtins.paint as (pos: number, b?: number) => void)(fx.fromFloat(0.99))
    const [r, , b] = capturedPixel()
    expect(b).toBeGreaterThan(0.95)
    expect(r).toBeLessThan(0.05)
  })

  it('paint(0.5) → interpolates within [0,1], never blowing past 1.0', () => {
    const { builtins, capturedPixel } = makeShim()
    ;(builtins.setPalette as (p: number[]) => void)(rawPalette)
    ;(builtins.paint as (pos: number, b?: number) => void)(fx.fromFloat(0.5))
    const [r, g, b] = capturedPixel()
    for (const c of [r, g, b]) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
    expect(Math.abs(r - 0.5)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(b - 0.5)).toBeLessThanOrEqual(TOLERANCE)
  })
})

// ── Array family: pattern-domain storage (raw int32 elements) ─────────────────

describe('fx shim: array family stays in the raw domain', () => {
  // Build a raw array [1, 2, 3] as the pattern would (elements raw int32).
  function rawArray(...vals: number[]): number[] {
    const make = makeShim().builtins.array as (n: number) => number[]
    const a = make(fx.fromFloat(vals.length))
    vals.forEach((v, i) => { a[i] = fx.fromFloat(v) })
    return a
  }

  it('arrayLength returns the count as raw int32', () => {
    const { builtins } = makeShim()
    const a = rawArray(1, 2, 3)
    expect((builtins.arrayLength as (a: number[]) => number)(a)).toBe(fx.fromFloat(3))
  })

  it('arraySum keeps the raw sum (no double-encode)', () => {
    const { builtins } = makeShim()
    const a = rawArray(1, 2, 3)
    const sum = (builtins.arraySum as (a: number[]) => number)(a)
    expect(Math.abs(fx.toFloat(sum) - 6)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('arrayForEach hands the callback raw int32 indices', () => {
    const { builtins } = makeShim()
    const a = rawArray(10, 20, 30)
    const seenIdx: number[] = []
    ;(builtins.arrayForEach as (a: number[], fn: (v: number, i: number) => void) => void)(
      a, (_v, i) => seenIdx.push(i)
    )
    expect(seenIdx).toEqual([0, fx.fromFloat(1), fx.fromFloat(2)])
  })

  it('arrayReduce passes init through raw and returns a raw accumulator', () => {
    const { builtins } = makeShim()
    const a = rawArray(1, 2, 3)
    const total = (builtins.arrayReduce as (a: number[], fn: (acc: number, v: number) => number, init: number) => number)(
      a, (acc, v) => acc + v, fx.fromFloat(10)
    )
    expect(Math.abs(fx.toFloat(total) - 16)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('arrayReplace stores raw args verbatim (not re-encoded as float)', () => {
    const { builtins } = makeShim()
    const a = rawArray(0, 0, 0)
    ;(builtins.arrayReplace as (a: number[], ...args: number[]) => void)(
      a, fx.fromFloat(0.25), fx.fromFloat(0.5)
    )
    expect(Math.abs(fx.toFloat(a[0]) - 0.25)).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(fx.toFloat(a[1]) - 0.5)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('arrayReplaceAt decodes a raw offset into an integer index', () => {
    const { builtins } = makeShim()
    const a = rawArray(0, 0, 0, 0)
    ;(builtins.arrayReplaceAt as (a: number[], offset: number, ...args: number[]) => void)(
      a, fx.fromFloat(2), fx.fromFloat(0.75)
    )
    expect(Math.abs(fx.toFloat(a[2]) - 0.75)).toBeLessThanOrEqual(TOLERANCE)
  })

  it('arrayMutate sees raw indices and stores raw return values', () => {
    const { builtins } = makeShim()
    const a = rawArray(0, 0, 0)
    // write each slot's index (as a 0..1 value) back into the array
    ;(builtins.arrayMutate as (a: number[], fn: (v: number, i: number) => number) => void)(
      a, (_v, i) => i // i already raw; storing it round-trips
    )
    expect(a[0]).toBe(0)
    expect(a[1]).toBe(fx.fromFloat(1))
    expect(a[2]).toBe(fx.fromFloat(2))
  })

  it('proxy .mutate also receives raw indices', () => {
    const a = rawArray(0, 0)
    ;(a as unknown as { mutate: (fn: (v: number, i: number) => number) => void })
      .mutate((_v, i) => i)
    expect(a[1]).toBe(fx.fromFloat(1))
  })
})

// ── time ──────────────────────────────────────────────────────────────────────

describe('fx shim: time', () => {
  it('time(raw_1.0) returns raw 0.5 when virtual time is half the period', () => {
    // At virtualTime=32768 and interval=1, float shim returns 0.5.
    // With raw interval = fx.fromFloat(1) = 65536, fx shim should return fx.fromFloat(0.5) = 32768.
    const { builtins } = createFxShim({ grid: defaultGrid, getVirtualTime: () => 32768 })
    const result = (builtins.time as (i: number) => number)(SCALE)
    expect(Math.abs(fx.toFloat(result) - 0.5)).toBeLessThanOrEqual(TOLERANCE)
  })
})

// ── transformPoint: float in → raw out ───────────────────────────────────────

describe('fx shim: transformPoint', () => {
  it('identity transform: float 0.5 → raw 32768', () => {
    const { transformPoint } = makeShim()
    const [x, y] = transformPoint(0.5, 0.5, 0)
    expect(x).toBe(fx.fromFloat(0.5))
    expect(y).toBe(fx.fromFloat(0.5))
  })

  it('identity transform: float 0 → raw 0', () => {
    const { transformPoint } = makeShim()
    const [x, y] = transformPoint(0, 0, 0)
    expect(x).toBe(0)
    expect(y).toBe(0)
  })

  it('after translate(raw_0.25, raw_0), transformPoint(0,0,0) returns [raw_0.25, 0, 0]', () => {
    const { builtins, transformPoint } = makeShim()
    ;(builtins.translate as (x: number, y: number) => void)(fx.fromFloat(0.25), 0)
    const [x, y] = transformPoint(0, 0, 0)
    expect(Math.abs(fx.toFloat(x) - 0.25)).toBeLessThanOrEqual(TOLERANCE)
    expect(y).toBe(0)
  })

  it('returns integer raw values', () => {
    const { transformPoint } = makeShim()
    const [x, y, z] = transformPoint(0.3, 0.7, 0)
    expect(Number.isInteger(x)).toBe(true)
    expect(Number.isInteger(y)).toBe(true)
    expect(Number.isInteger(z)).toBe(true)
  })
})

// ── mapPixels callback receives raw args ─────────────────────────────────────

describe('fx shim: mapPixels', () => {
  it('callback receives raw int32 x/y coordinates', () => {
    const { builtins } = makeShim()
    const coords: number[] = []
    ;(builtins.mapPixels as (fn: (i: number, x: number, y: number, z: number) => void) => void)(
      (_i, x, y) => { coords.push(x, y) }
    )
    // All collected coordinates should be integers (raw int32)
    for (const c of coords) {
      expect(Number.isInteger(c)).toBe(true)
    }
  })

  it('callback receives coordinates in expected raw range for [0,1]', () => {
    const { builtins } = makeShim()
    const xs: number[] = []
    ;(builtins.mapPixels as (fn: (i: number, x: number, y: number, z: number) => void) => void)(
      (_i, x) => { xs.push(x) }
    )
    // 4-col grid: x values are 0, 1/3, 2/3, 1 → raw [0, ~21845, ~43691, 65536]
    expect(xs).toContain(0)
    expect(xs).toContain(SCALE) // 1.0 in raw
  })
})

// ── Per-function overridability ───────────────────────────────────────────────

describe('fx shim: per-function overridability', () => {
  it('individual built-in can be stubbed after creation', () => {
    const { builtins } = makeShim()
    // Replace sin with a stub that always returns raw 0.5
    const stub = () => fx.fromFloat(0.5)
    builtins.sin = stub
    expect((builtins.sin as () => number)()).toBe(fx.fromFloat(0.5))
  })

  it('stubbing one function does not affect others', () => {
    const { builtins } = makeShim()
    builtins.sin = () => 0
    // cos should still work
    const cosResult = (builtins.cos as (v: number) => number)(0)
    expect(Math.abs(fx.toFloat(cosResult) - 1.0)).toBeLessThanOrEqual(TOLERANCE)
  })
})

// ── ShimContext surface ───────────────────────────────────────────────────────

describe('fx shim: exposes correct ShimContext shape', () => {
  it('has builtins, capturedPixel, getBuiltin, transformPoint', () => {
    const shim = makeShim()
    expect(typeof shim.builtins).toBe('object')
    expect(typeof shim.capturedPixel).toBe('function')
    expect(typeof shim.getBuiltin).toBe('function')
    expect(typeof shim.transformPoint).toBe('function')
  })

  it('getBuiltin returns the same value as builtins[key]', () => {
    const shim = makeShim()
    expect(shim.getBuiltin('sin')).toBe(shim.builtins.sin)
    expect(shim.getBuiltin('PI')).toBe(shim.builtins.PI)
  })

  it('no framework imports: all builtins are plain JS values', () => {
    const shim = makeShim()
    // Just a sanity check that the builtins object exists and has entries
    expect(Object.keys(shim.builtins).length).toBeGreaterThan(10)
  })
})
