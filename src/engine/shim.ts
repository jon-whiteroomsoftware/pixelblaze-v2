import { fx } from './fixedpoint'

const PI2 = Math.PI * 2

export interface ShimConfig {
  grid: { rows: number; cols: number }
  getVirtualTime: () => number
}

export interface ShimContext {
  builtins: Record<string, unknown>
  capturedPixel: () => [number, number, number]
  getBuiltin: (name: string) => unknown
  // Encode/decode a scalar at the engine↔pattern boundary. The float64 shim is
  // the identity; the fixed-point shim converts float ↔ raw int32 so the render
  // loop, controls, and watchers can stay mode-agnostic.
  encodeScalar: (n: number) => number
  decodeScalar: (n: number) => number
  // Applies the current transform matrix to a map coordinate. The render loop
  // calls this before render2D/render3D so transform()/translate()/etc. behave
  // as they do on hardware (the transformed coords are handed to the pattern).
  transformPoint: (x: number, y: number, z: number) => [number, number, number]
}

export function createShim(config: ShimConfig): ShimContext {
  const { grid, getVirtualTime } = config
  let captR = 0, captG = 0, captB = 0
  let palette: number[] = []
  let perlinWrapX = 256, perlinWrapY = 256, perlinWrapZ = 256
  let prngState = 0

  // ── Coordinate transform stack ────────────────────────────────────────────
  // A 4x4 homogeneous matrix (row-major). Each transform call pre-multiplies a
  // new matrix so transforms apply to a point in call order — e.g. the classic
  // translate(-.5,-.5); rotate(a); translate(.5,.5) rotates about the centre.
  // The CTM persists across frames until resetTransform() (hardware behaviour).
  let ctm = mat4Identity()
  function compose(m: number[]) { ctm = mat4Mul(m, ctm) }
  function transformPoint(x: number, y: number, z: number): [number, number, number] {
    return [
      ctm[0] * x + ctm[1] * y + ctm[2] * z + ctm[3],
      ctm[4] * x + ctm[5] * y + ctm[6] * z + ctm[7],
      ctm[8] * x + ctm[9] * y + ctm[10] * z + ctm[11],
    ]
  }

  function capturedPixel(): [number, number, number] {
    const out: [number, number, number] = [captR, captG, captB]
    captR = 0; captG = 0; captB = 0
    return out
  }

  const noop = () => undefined

  const builtins: Record<string, unknown> = {
    // ── Color ──────────────────────────────────────────────────────────────
    hsv(h: number, s: number, v: number) {
      [captR, captG, captB] = hsvToRgb(h, s, v)
    },
    hsv24(h: number, s: number, v: number) {
      [captR, captG, captB] = hsvToRgb(h, s, v)
    },
    rgb(r: number, g: number, b: number) {
      captR = r; captG = g; captB = b
    },

    // ── Clock ──────────────────────────────────────────────────────────────
    time(interval: number) {
      return (getVirtualTime() / (interval * 65536)) % 1
    },

    // ── Waveform ───────────────────────────────────────────────────────────
    wave: (v: number) => (1 - Math.cos(((v % 1) + 1) % 1 * PI2)) / 2,
    triangle(v: number) {
      const w = ((v % 1) + 1) % 1
      return w < 0.5 ? w * 2 : (1 - w) * 2
    },
    square: (v: number, duty: number = 0.5) => (((v % 1) + 1) % 1 < duty ? 1 : 0),
    mix: (lo: number, hi: number, w: number) => lo + (hi - lo) * w,
    smoothstep(lo: number, hi: number, v: number) {
      const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
      return t * t * (3 - 2 * t)
    },
    bezierQuadratic: (t: number, p0: number, p1: number, p2: number) => {
      const u = 1 - t
      return u * u * p0 + 2 * u * t * p1 + t * t * p2
    },
    bezierCubic: (t: number, p0: number, p1: number, p2: number, p3: number) => {
      const u = 1 - t
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
    },

    // ── Interpolation ──────────────────────────────────────────────────────
    clamp: (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v)),
    map: (v: number, fl: number, fh: number, tl: number, th: number) =>
      tl + (v - fl) * (th - tl) / (fh - fl),

    // ── Math ───────────────────────────────────────────────────────────────
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    frac: (v: number) => v - Math.trunc(v),
    sqrt: Math.sqrt,
    hypot: Math.hypot,
    hypot3: (x: number, y: number, z: number) => Math.hypot(x, y, z),
    pow: Math.pow,
    exp: Math.exp,
    log: Math.log,
    log2: Math.log2,
    mod: (x: number, y: number) => x - Math.floor(x / y) * y,
    min: Math.min,
    max: Math.max,
    random: (maxVal: number = 1) => Math.random() * maxVal,
    prngSeed(seed: number) { const old = prngState; prngState = seed >>> 0; return old },
    prng(maxVal: number = 1) {
      // mulberry32
      prngState = (prngState + 0x6D2B79F5) >>> 0
      let z = prngState
      z = Math.imul(z ^ (z >>> 15), z | 1)
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
      return (((z ^ (z >>> 14)) >>> 0) / 4294967296) * maxVal
    },

    // ── Constants ──────────────────────────────────────────────────────────
    PI: Math.PI,
    PI2,
    PI3_4: Math.PI * 3 / 4,
    PISQ: Math.PI * Math.PI,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    SQRT2: Math.SQRT2,
    SQRT1_2: Math.SQRT1_2,

    // ── Wall-clock functions (local time; no network sync) ──────────────────
    clockYear:    () => new Date().getFullYear(),
    clockMonth:   () => new Date().getMonth() + 1,
    clockDay:     () => new Date().getDate(),
    clockHour:    () => new Date().getHours(),
    clockMinute:  () => new Date().getMinutes(),
    clockSecond:  () => new Date().getSeconds(),
    clockWeekday: () => new Date().getDay() + 1,

    // ── Pixel map ──────────────────────────────────────────────────────────
    pixelCount: grid.rows * grid.cols,
    has2DMap: () => true,
    has3DMap: () => false,
    pixelMapDimensions: () => 2,
    mapPixels(fn: (index: number, x: number, y: number, z: number) => void) {
      const { rows, cols } = grid
      for (let row = 0; row < rows; row++) {
        const y = rows === 1 ? 0 : row / (rows - 1)
        for (let col = 0; col < cols; col++) {
          const x = cols === 1 ? 0 : col / (cols - 1)
          // Current coordinate transforms apply before fn is called.
          const [tx, ty, tz] = transformPoint(x, y, 0)
          fn(row * cols + col, tx, ty, tz)
        }
      }
    },

    // ── Palette ────────────────────────────────────────────────────────────
    // Pixelblaze palettes are flat [pos, r, g, b, ...] groups, all in 0..1.
    setPalette(pal: number[]) { palette = pal },
    paint(pos: number, brightness: number = 1) {
      const pal = palette
      if (pal.length < 8) return // need at least two stops
      const p = (((pos % 1) + 1) % 1)
      const stops = Math.floor(pal.length / 4)
      // find the last stop whose position is <= p
      let lo = 0
      for (let s = 0; s < stops - 1; s++) {
        if (pal[s * 4] <= p) lo = s
      }
      const hi = Math.min(lo + 1, stops - 1)
      const loPos = pal[lo * 4], hiPos = pal[hi * 4]
      const span = hiPos - loPos
      const t = span <= 0 ? 0 : Math.min(1, Math.max(0, (p - loPos) / span))
      captR = lerp(pal[lo * 4 + 1], pal[hi * 4 + 1], t) * brightness
      captG = lerp(pal[lo * 4 + 2], pal[hi * 4 + 2], t) * brightness
      captB = lerp(pal[lo * 4 + 3], pal[hi * 4 + 3], t) * brightness
    },

    // ── Hardware I/O stubs ─────────────────────────────────────────────────
    analogRead: () => 0,
    digitalWrite: noop,
    digitalRead: () => 0,
    touchRead: () => 0,
    pinMode: noop,
    readAdc: () => 0,

    // ── Sensor expansion globals ───────────────────────────────────────────
    frequencyData: new Array(32).fill(0),
    energyAverage: 0,
    accelerometer: [0, 0, 0, 0],
    light: 0,
    analogInputs: [0, 0, 0, 0],
    maxFrequency: 0,
    maxFrequencyMagnitude: 0,
    nodeId: () => 0,

    // ── Coordinate transforms ──────────────────────────────────────────────
    resetTransform() { ctm = mat4Identity() },
    translate(x: number, y: number) {
      compose([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, 0, 0, 0, 0, 1])
    },
    translate3D(x: number, y: number, z: number) {
      compose([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1])
    },
    scale(x: number, y: number) {
      compose([x, 0, 0, 0, 0, y, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    },
    scale3D(x: number, y: number, z: number) {
      compose([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1])
    },
    rotate(a: number) {
      const c = Math.cos(a), s = Math.sin(a)
      compose([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    },
    rotateZ(a: number) {
      const c = Math.cos(a), s = Math.sin(a)
      compose([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    },
    rotateX(a: number) {
      const c = Math.cos(a), s = Math.sin(a)
      compose([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1])
    },
    rotateY(a: number) {
      const c = Math.cos(a), s = Math.sin(a)
      compose([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1])
    },
    // Args are column-major (m11,m21,m31,m41, m12,...): m{row}{col} = a[col*4+row].
    transform(...a: number[]) {
      const m = new Array<number>(16)
      for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) m[r * 4 + col] = a[col * 4 + r]
      compose(m)
    },
    move: noop,

    // ── Perlin noise ──────────────────────────────────────────────────────────
    setPerlinWrap(x: number, y: number, z: number) {
      perlinWrapX = Math.max(2, Math.min(256, Math.round(x)))
      perlinWrapY = Math.max(2, Math.min(256, Math.round(y)))
      perlinWrapZ = Math.max(2, Math.min(256, Math.round(z)))
    },
    perlin(x: number, y: number, z: number, seed: number = 0) {
      return (perlinRaw(x, y, z, seed, perlinWrapX, perlinWrapY, perlinWrapZ) + 1) * 0.5
    },
    perlinFbm(x: number, y: number, z: number, lacunarity: number, gain: number, octaves: number) {
      let val = 0, amp = 1, freq = 1, maxAmp = 0
      const n = Math.round(octaves)
      for (let i = 0; i < n; i++) {
        val += amp * perlinRaw(x * freq, y * freq, z * freq, 0, perlinWrapX, perlinWrapY, perlinWrapZ)
        maxAmp += amp
        freq *= lacunarity
        amp *= gain
      }
      return (val / maxAmp + 1) * 0.5
    },
    perlinRidge(x: number, y: number, z: number, lacunarity: number, gain: number, offset: number, octaves: number) {
      let val = 0, amp = 1, freq = 1, weight = 1, maxAmp = 0
      const n = Math.round(octaves)
      for (let i = 0; i < n; i++) {
        const r = offset - Math.abs(perlinRaw(x * freq, y * freq, z * freq, 0, perlinWrapX, perlinWrapY, perlinWrapZ))
        val += r * r * weight * amp
        maxAmp += amp
        weight = Math.min(Math.max(r * gain, 0), 1)
        freq *= lacunarity
        amp *= gain
      }
      return Math.min(Math.max(val / maxAmp, 0), 1)
    },
    perlinTurbulence(x: number, y: number, z: number, lacunarity: number, gain: number, octaves: number) {
      let val = 0, amp = 1, freq = 1, maxAmp = 0
      const n = Math.round(octaves)
      for (let i = 0; i < n; i++) {
        val += amp * Math.abs(perlinRaw(x * freq, y * freq, z * freq, 0, perlinWrapX, perlinWrapY, perlinWrapZ))
        maxAmp += amp
        freq *= lacunarity
        amp *= gain
      }
      return val / maxAmp
    },

    // ── Array ──────────────────────────────────────────────────────────────
    // Pixelblaze hardware implicitly truncates float indices to integers.
    // Proxy handles float indexing and exposes Pixelblaze method forms.
    array: (n: number) => pbArray(n),

    // Standalone equivalents of the array method forms
    arrayLength:    (a: number[]) => a.length,
    arrayForEach:   (a: number[], fn: (v: number, i: number, a: number[]) => void) => a.forEach((v, i) => fn(v, i, a)),
    arrayReduce:    (a: number[], fn: (acc: number, v: number, i: number, a: number[]) => number, init: number) => a.reduce(fn, init),
    arraySum:       (a: number[]) => a.reduce((s, v) => s + v, 0),
    arraySort:      (a: number[]) => { a.sort((x, y) => x - y); return a },
    arraySortBy:    (a: number[], fn: (x: number, y: number) => number) => { a.sort(fn); return a },
    arrayMutate:    (a: number[], fn: (v: number, i: number, a: number[]) => number) => { a.forEach((v, i) => { a[i] = fn(v, i, a) }); return a },
    arrayMapTo:     (src: number[], dest: number[], fn: (v: number, i: number, a: number[]) => number) => { src.forEach((v, i) => { if (i < dest.length) dest[i] = fn(v, i, src) }); return dest },
    arrayReplace:   (a: number[], ...args: number[]) => { args.forEach((v, i) => { a[i] = v }); return a },
    arrayReplaceAt: (a: number[], offset: number, ...args: number[]) => { args.forEach((v, i) => { a[offset + i] = v }); return a },
  }

  return {
    builtins,
    capturedPixel,
    getBuiltin: (name: string) => builtins[name],
    encodeScalar: (n: number) => n,
    decodeScalar: (n: number) => n,
    transformPoint,
  }
}

// ── Fixed-point shim ─────────────────────────────────────────────────────────
//
// Wraps every built-in at an fx.* seam: raw int32 in → float → built-in → raw int32 out.
// The float64 shim handles all internal state (CTM, captures, prng, perlin).
// The seam is per-function so individual wrappers can be replaced with LUTs later.
//
// capturedPixel() still returns floats — the renderer reads at the canvas boundary.
// transformPoint() converts the float CTM output to raw int32 (render loop is agnostic).

export function createFxShim(config: ShimConfig): ShimContext {
  const floatShim = createShim(config)
  const { builtins: floatBuiltins, capturedPixel, transformPoint: floatTP } = floatShim

  // Wrap one function: numeric args converted raw→float, numeric result converted float→raw.
  // Non-numeric args (callbacks, arrays) pass through so array/callback built-ins still work.
  function fxWrap(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown {
    return (...rawArgs: unknown[]) => {
      const floatArgs = rawArgs.map(a => typeof a === 'number' ? fx.toFloat(a) : a)
      const result = fn(...floatArgs)
      return typeof result === 'number' ? fx.fromFloat(result) : result
    }
  }

  // The fixed-point emit references the fx.* helpers directly, so expose the
  // engine to the evaluated pattern as a built-in.
  const fxBuiltins: Record<string, unknown> = { fx }

  for (const [key, val] of Object.entries(floatBuiltins)) {
    if (typeof val === 'function') {
      fxBuiltins[key] = fxWrap(val as (...args: unknown[]) => unknown)
    } else if (typeof val === 'number') {
      fxBuiltins[key] = fx.fromFloat(val)
    } else {
      // Arrays (frequencyData, etc.) and other non-numeric values pass through unchanged.
      fxBuiltins[key] = val
    }
  }

  // setPalette receives the palette array straight from the pattern, where every
  // entry (positions and r/g/b, all 0..1) is raw int32. fxWrap leaves arrays
  // untouched, so without this override the float paint() logic would read raw
  // ints as floats — stops never match and colours blow far past 1.0 (the whole
  // grid clamps to a single saturated hue). Decode each element raw→float here,
  // mirroring the arg-decoding fxWrap does for scalar built-ins.
  fxBuiltins.setPalette = (rawPal: unknown) => {
    const pal = Array.isArray(rawPal) ? rawPal.map(v => typeof v === 'number' ? fx.toFloat(v) : v) : rawPal
    ;(floatBuiltins.setPalette as (p: unknown) => void)(pal)
  }

  // ── Arrays are pattern-domain storage ──────────────────────────────────────
  // fxWrap's "number arg raw→float, number result float→raw" rule is wrong for
  // the array family: elements are already raw int32 (the pattern stored them),
  // sums/reduces stay raw, and args written in must not be re-encoded — the same
  // class of bug as setPalette above. Only the JS-generated indices handed to
  // callbacks (and a raw offset coming back into replaceAt) need conversion.
  // fxEmit already decodes subscripts as `(i)>>16`; mirror that here so the
  // family is raw-correct end to end. (Sensor arrays like frequencyData are
  // exposed as float zero-stubs and read 0 in either domain, so they need no
  // such handling.)
  const encIdx = (i: number) => fx.fromFloat(i)
  const decIdx = (rawOffset: number) => rawOffset >> 16
  fxBuiltins.array        = (rawN: number) => pbArray(Math.round(fx.toFloat(rawN)), encIdx, decIdx)
  fxBuiltins.arrayLength  = (a: number[]) => fx.fromFloat(a.length)
  fxBuiltins.arraySum     = (a: number[]) => a.reduce((s, v) => s + v, 0)
  fxBuiltins.arrayForEach = (a: number[], fn: (v: number, i: number, a: number[]) => void) => a.forEach((v, i) => fn(v, encIdx(i), a))
  fxBuiltins.arrayReduce  = (a: number[], fn: (acc: number, v: number, i: number, a: number[]) => number, init: number) => a.reduce((acc, v, i, arr) => fn(acc, v, encIdx(i), arr), init)
  fxBuiltins.arraySort    = (a: number[]) => { a.sort((x, y) => x - y); return a }
  fxBuiltins.arraySortBy  = (a: number[], fn: (x: number, y: number) => number) => { a.sort(fn); return a }
  fxBuiltins.arrayMutate  = (a: number[], fn: (v: number, i: number, a: number[]) => number) => { a.forEach((v, i) => { a[i] = fn(v, encIdx(i), a) }); return a }
  fxBuiltins.arrayMapTo   = (src: number[], dest: number[], fn: (v: number, i: number, a: number[]) => number) => { src.forEach((v, i) => { if (i < dest.length) dest[i] = fn(v, encIdx(i), src) }); return dest }
  fxBuiltins.arrayReplace = (a: number[], ...args: number[]) => { args.forEach((v, i) => { a[i] = v }); return a }
  fxBuiltins.arrayReplaceAt = (a: number[], offset: number, ...args: number[]) => { const o = decIdx(offset); args.forEach((v, i) => { a[o + i] = v }); return a }

  // mapPixels calls the pattern callback with (index, x, y, z) in float domain.
  // Override so the callback receives raw int32 as the fixed-point transpiler expects.
  fxBuiltins.mapPixels = (rawFn: (...args: unknown[]) => void) => {
    ;(floatBuiltins.mapPixels as (...args: unknown[]) => void)(
      (index: number, x: number, y: number, z: number) =>
        rawFn(fx.fromFloat(index), fx.fromFloat(x), fx.fromFloat(y), fx.fromFloat(z))
    )
  }

  // Render loop supplies float pixel coords; return raw int32 for the pattern's render2D/3D.
  function transformPoint(x: number, y: number, z: number): [number, number, number] {
    const [tx, ty, tz] = floatTP(x, y, z)
    return [fx.fromFloat(tx), fx.fromFloat(ty), fx.fromFloat(tz)]
  }

  return {
    builtins: fxBuiltins,
    capturedPixel,
    getBuiltin: (name: string) => fxBuiltins[name],
    encodeScalar: fx.fromFloat,
    decodeScalar: fx.toFloat,
    transformPoint,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mat4Identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

// Row-major 4x4 product a*b.
function mat4Mul(a: number[], b: number[]): number[] {
  const o = new Array<number>(16)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]
      o[r * 4 + c] = s
    }
  }
  return o
}

// `encodeIndex`/`decodeIndex` convert between the JS integer indices this proxy
// works in and the pattern's numeric domain. They default to the identity (the
// float shim), and the fixed-point shim passes raw↔int codecs so callback
// indices arrive as raw int32 and an incoming raw `replaceAt` offset is decoded.
function pbArray(
  n: number,
  encodeIndex: (i: number) => number = (i) => i,
  decodeIndex: (raw: number) => number = (i) => i,
): number[] {
  const raw: number[] = new Array(Math.floor(n)).fill(0)
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        const i = Number(prop)
        if (!isNaN(i) && i >= 0) return target[Math.floor(i)]
        switch (prop) {
          case 'sum':       return () => target.reduce((s, v) => s + v, 0)
          case 'mutate':    return (fn: (v: number, i: number, a: number[]) => number) => { target.forEach((v, i) => { target[i] = fn(v, encodeIndex(i), target) }); return receiver }
          case 'mapTo':     return (dest: number[], fn: (v: number, i: number, a: number[]) => number) => { target.forEach((v, i) => { if (i < dest.length) dest[i] = fn(v, encodeIndex(i), target) }); return dest }
          case 'replace':   return (...args: number[]) => { args.forEach((v, i) => { target[i] = v }); return receiver }
          case 'replaceAt': return (offset: number, ...args: number[]) => { const o = decodeIndex(offset); args.forEach((v, i) => { target[o + i] = v }); return receiver }
          case 'sortBy':    return (fn: (a: number, b: number) => number) => { target.sort(fn); return receiver }
          case 'sort':      return () => { target.sort((a, b) => a - b); return receiver }
        }
      }
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (typeof prop === 'string') {
        const i = Number(prop)
        if (!isNaN(i) && i >= 0) { target[Math.floor(i)] = value; return true }
      }
      return Reflect.set(target, prop, value, receiver)
    },
  })
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v]
  const h6 = ((h % 1) + 1) % 1 * 6
  const i = Math.floor(h6)
  const f = h6 - i
  const p = v * (1 - s)
  const q = v * (1 - s * f)
  const t = v * (1 - s * (1 - f))
  switch (i % 6) {
    case 0: return [v, t, p]
    case 1: return [q, v, p]
    case 2: return [p, v, t]
    case 3: return [p, q, v]
    case 4: return [t, p, v]
    default: return [v, p, q]
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// ── Perlin noise helpers ──────────────────────────────────────────────────────
// Ken Perlin's improved noise (2002). Output of perlinRaw is in [-1, 1].
// Not bit-identical to Pixelblaze firmware (accepted divergence per ADR-0001).

// prettier-ignore
const _PERM = new Uint8Array([
  151,160,137, 91, 90, 15,131, 13,201, 95, 96, 53,194,233,  7,225,
  140, 36,103, 30, 69,142,  8, 99, 37,240, 21, 10, 23,190,  6,148,
  247,120,234, 75,  0, 26,197, 62, 94,252,219,203,117, 35, 11, 32,
   57,177, 33, 88,237,149, 56, 87,174, 20,125,136,171,168, 68,175,
   74,165, 71,134,139, 48, 27,166, 77,146,158,231, 83,111,229,122,
   60,211,133,230,220,105, 92, 41, 55, 46,245, 40,244,102,143, 54,
   65, 25, 63,161,  1,216, 80, 73,209, 76,132,187,208, 89, 18,169,
  200,196,135,130,116,188,159, 86,164,100,109,198,173,186,  3, 64,
   52,217,226,250,124,123,  5,202, 38,147,118,126,255, 82, 85,212,
  207,206, 59,227, 47, 16, 58, 17,182,189, 28, 42,223,183,170,213,
  119,248,152,  2, 44,154,163, 70,221,153,101,155,167, 43,172,  9,
  129, 22, 39,253, 19, 98,108,110, 79,113,224,232,178,185,112,104,
  218,246, 97,228,251, 34,242,193,238,210,144, 12,191,179,162,241,
   81, 51,145,235,249, 14,239,107, 49,192,214, 31,181,199,106,157,
  184, 84,204,176,115,121, 50, 45,127,  4,150,254,138,236,205, 93,
  222,114, 67, 29, 24, 72,243,141,128,195, 78, 66,215, 61,156,180,
])

function _perm(n: number): number { return _PERM[n & 255] }

function _fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10) }

function _grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z)
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}

function perlinRaw(x: number, y: number, z: number, seed: number, wx: number, wy: number, wz: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const X  = ((xi % wx) + wx) % wx
  const Y  = ((yi % wy) + wy) % wy
  const Z  = ((zi % wz) + wz) % wz
  const X1 = (X + 1) % wx
  const Y1 = (Y + 1) % wy
  const Z1 = (Z + 1) % wz
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = _fade(xf), v = _fade(yf), w = _fade(zf)
  // seed offsets the z table lookup, producing a unique slice per seed value
  const sz  = (Z  + seed) & 255
  const sz1 = (Z1 + seed) & 255
  return lerp(
    lerp(
      lerp(_grad(_perm(_perm(_perm(X)  + Y)  + sz),  xf,     yf,     zf),
           _grad(_perm(_perm(_perm(X1) + Y)  + sz),  xf - 1, yf,     zf),     u),
      lerp(_grad(_perm(_perm(_perm(X)  + Y1) + sz),  xf,     yf - 1, zf),
           _grad(_perm(_perm(_perm(X1) + Y1) + sz),  xf - 1, yf - 1, zf),     u), v),
    lerp(
      lerp(_grad(_perm(_perm(_perm(X)  + Y)  + sz1), xf,     yf,     zf - 1),
           _grad(_perm(_perm(_perm(X1) + Y)  + sz1), xf - 1, yf,     zf - 1), u),
      lerp(_grad(_perm(_perm(_perm(X)  + Y1) + sz1), xf,     yf - 1, zf - 1),
           _grad(_perm(_perm(_perm(X1) + Y1) + sz1), xf - 1, yf - 1, zf - 1), u), v), w)
}
