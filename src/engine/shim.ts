const PI2 = Math.PI * 2

export interface ShimConfig {
  grid: { rows: number; cols: number }
  getVirtualTime: () => number
}

export interface ShimContext {
  builtins: Record<string, unknown>
  capturedPixel: () => [number, number, number]
}

export function createShim(config: ShimConfig): ShimContext {
  const { grid, getVirtualTime } = config
  let captR = 0, captG = 0, captB = 0
  let palette: number[] = []
  let perlinWrapX = 256, perlinWrapY = 256, perlinWrapZ = 256
  let prngState = 0

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
          fn(row * cols + col, x, y, 0)
        }
      }
    },

    // ── Palette ────────────────────────────────────────────────────────────
    setPalette(pal: number[]) { palette = pal },
    paint(pos: number, brightness: number = 1) {
      if (palette.length < 8) return
      const p = (((pos % 1) + 1) % 1) * 255
      // find surrounding stops (entries are [pos, r, g, b] groups of 4)
      let lo = 0, hi = palette.length - 4
      for (let i = 0; i < palette.length - 4; i += 4) {
        if (palette[i] <= p) lo = i
        if (palette[i + 4] >= p) { hi = i + 4; break }
      }
      const loPos = palette[lo], hiPos = palette[hi]
      const t = loPos === hiPos ? 0 : (p - loPos) / (hiPos - loPos)
      captR = lerp(palette[lo + 1], palette[hi + 1], t) / 255 * brightness
      captG = lerp(palette[lo + 2], palette[hi + 2], t) / 255 * brightness
      captB = lerp(palette[lo + 3], palette[hi + 3], t) / 255 * brightness
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

    // ── Coordinate transform no-ops ────────────────────────────────────────
    // 2D and 3D transforms are deferred (preview renders raw map coords).
    resetTransform: noop,
    translate: noop, translate3D: noop,
    scale: noop,     scale3D: noop,
    rotate: noop,    rotateX: noop, rotateY: noop, rotateZ: noop,
    transform: noop,
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

  return { builtins, capturedPixel }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pbArray(n: number): number[] {
  const raw: number[] = new Array(Math.floor(n)).fill(0)
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        const i = Number(prop)
        if (!isNaN(i) && i >= 0) return target[Math.floor(i)]
        switch (prop) {
          case 'sum':       return () => target.reduce((s, v) => s + v, 0)
          case 'mutate':    return (fn: (v: number, i: number, a: number[]) => number) => { target.forEach((v, i) => { target[i] = fn(v, i, target) }); return receiver }
          case 'mapTo':     return (dest: number[], fn: (v: number, i: number, a: number[]) => number) => { target.forEach((v, i) => { if (i < dest.length) dest[i] = fn(v, i, target) }); return dest }
          case 'replace':   return (...args: number[]) => { args.forEach((v, i) => { target[i] = v }); return receiver }
          case 'replaceAt': return (offset: number, ...args: number[]) => { args.forEach((v, i) => { target[offset + i] = v }); return receiver }
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
