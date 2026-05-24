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
    hsv24(color: number) {
      const h = ((color >> 16) & 0xff) / 255
      const s = ((color >> 8) & 0xff) / 255
      const v = (color & 0xff) / 255
      ;[captR, captG, captB] = hsvToRgb(h, s, v)
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
    atan2: Math.atan2,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sqrt: Math.sqrt,
    pow: Math.pow,
    log: Math.log,
    log2: Math.log2,
    min: Math.min,
    max: Math.max,
    random: (maxVal: number = 1) => Math.random() * maxVal,

    // ── Constants ──────────────────────────────────────────────────────────
    PI: Math.PI,
    PI2,
    E: Math.E,

    // ── Pixel map ──────────────────────────────────────────────────────────
    pixelCount: grid.rows * grid.cols,
    has2DMap: true,
    has3DMap: false,
    pixelMapDimensions: 2,
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
    nodeId: 0,

    // ── Coordinate transform no-ops ────────────────────────────────────────
    resetTransform: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    transform: noop,
    move: noop,

    // ── Array ──────────────────────────────────────────────────────────────
    // Pixelblaze hardware implicitly truncates float indices to integers.
    // Wrap in a Proxy so patterns that index arrays with float values (a
    // common pattern: `buf[x * width]`) work the same as on hardware.
    array: (n: number) => {
      const raw = new Array(Math.floor(n)).fill(0)
      return new Proxy(raw, {
        get(target, prop, receiver) {
          if (typeof prop === 'string') {
            const i = Number(prop)
            if (!isNaN(i) && i >= 0) return target[Math.floor(i)]
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
    },
  }

  return { builtins, capturedPixel }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
