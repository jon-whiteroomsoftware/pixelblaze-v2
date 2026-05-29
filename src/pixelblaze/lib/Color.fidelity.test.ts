import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Fidelity sweep for Color.js (#93). Hue arithmetic, palettes, blend modes, and
// brightness adjustments all operate in 0..1 with small products and pow/sqrt.
// Each expression is checked against fast-preview under the 16.16 engine; hue
// outputs (0..1 wheel) are compared modulo 1 to ignore wrap-seam crossings.

const grid = { rows: 8, cols: 8 }

// `body` is raw render2D source so the out-var helpers (lerpHSV/tempToHSV) can
// run and their shared globals be read back via `out`.
function probe(body: string, mode: 'fast' | 'fidelity') {
  const src = `export var out\nfunction render2D(index, x, y) { ${body} }`
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)
  const shim: ShimContext =
    mode === 'fidelity'
      ? createFxShim({ grid, getVirtualTime: () => 0 })
      : createShim({ grid, getVirtualTime: () => 0 })
  const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)
  return (x: number, y: number) => {
    handle.render2D(shim.encodeScalar(0), shim.encodeScalar(x), shim.encodeScalar(y))
    return shim.decodeScalar(handle.getExports().out as number)
  }
}

const SAMPLES = [0.03, 0.27, 0.49, 0.51, 0.73, 0.97]

function ringDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 1
  return Math.min(d, 1 - d)
}

function expectFidelityMatchesFast(body: string, opts: { wrap?: boolean; tol?: number } = {}) {
  const tol = opts.tol ?? 0.02
  const fast = probe(body, 'fast')
  const fid = probe(body, 'fidelity')
  for (const x of SAMPLES) {
    for (const y of SAMPLES) {
      const f = fast(x, y)
      const d = fid(x, y)
      expect(Number.isFinite(d)).toBe(true)
      const diff = opts.wrap ? ringDiff(f, d) : Math.abs(f - d)
      expect(diff).toBeLessThanOrEqual(tol)
    }
  }
}

describe('Color.js fidelity sweep (#93)', () => {
  it.each([
    'lerpHue(x, y, 0.5)',
    'complementHue(x)',
    'analogousHue(x, 0.083)',
    'triadicHue(x, 1)',
    'paletteLinear(x, 0.1, 0.6)',
    'fireHue(x)',
    'iceHue(x)',
    'rainbowHue(x)',
    'neonHue(x)',
  ])('hue helper %s matches fast (wrap-aware)', (expr) => {
    expectFidelityMatchesFast(`out = Color.${expr}`, { wrap: true })
  })

  it.each([
    'fireValue(x)',
    'fireSat(x)',
    'iceSat(x)',
    'iceValue(x)',
    'neonSat()',
    'neonValue(x)',
  ])('component %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`out = Color.${expr}`)
  })

  it.each([
    'blendAdd(x, y)',
    'blendMul(x, y)',
    'blendScreen(x, y)',
    'blendOverlay(x, y)',
    'blendDifference(x, y)',
    'blendHardLight(x, y)',
    'blendSoftLight(x, y)',
    'blendMax(x, y)',
    'blendMin(x, y)',
    'blendMix(x, y, 0.5)',
  ])('blend mode %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`out = Color.${expr}`)
  })

  it.each([
    'gamma(x, 2.2)',
    'boost(x, 0.3)',
    'contrast(x, 1.5)',
  ])('brightness adjust %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`out = Color.${expr}`)
  })

  it.each([
    ['lerpHSV', 'outH', { wrap: true }],
    ['lerpHSV', 'outS', {}],
    ['lerpHSV', 'outV', {}],
  ] as const)('lerpHSV sets %s in fidelity', (_fn, field, opts) => {
    expectFidelityMatchesFast(`Color.lerpHSV(x, 1, y, 0.7, 0.5, 1, 0.5); out = ${field}`, opts)
  })

  it.each([
    ['tempToHSV', 'outH', { wrap: true }],
    ['tempToHSV', 'outS', {}],
    ['tempToHSV', 'outV', {}],
  ] as const)('tempToHSV sets %s in fidelity', (_fn, field, opts) => {
    expectFidelityMatchesFast(`Color.tempToHSV(x); out = ${field}`, opts)
  })
})
