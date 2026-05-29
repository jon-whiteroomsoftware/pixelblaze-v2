import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Fidelity sweep for Anim.js (#93). Easing curves, interpolation, oscillators,
// timing helpers, and exponential follow run on a 0..1 phase with small pow()
// products. Each is checked against fast-preview under the 16.16 engine.
// Sawtooth outputs are compared modulo 1 (wrap seam), and step/quantised
// outputs allow a one-quantum boundary slip since the discontinuity is inherent.

const grid = { rows: 8, cols: 8 }

function probe(expr: string, mode: 'fast' | 'fidelity') {
  const src = `export var out\nfunction render2D(index, x, y) { out = ${expr} }`
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

function expectFidelityMatchesFast(expr: string, opts: { wrap?: boolean; tol?: number } = {}) {
  const tol = opts.tol ?? 0.02
  const fast = probe(expr, 'fast')
  const fid = probe(expr, 'fidelity')
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

describe('Anim.js fidelity sweep (#93)', () => {
  it.each([
    'easeIn2(x)',
    'easeOut2(x)',
    'easeInOut2(x)',
    'easeIn3(x)',
    'easeOut3(x)',
    'easeInOut3(x)',
    'easeIn4(x)',
    'easeOut4(x)',
    'easeInOut4(x)',
    'easeOutElastic(x)',
    'easeOutBounce(x)',
    'easeOutBack(x)',
  ])('easing %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Anim.${expr}`)
  })

  it.each([
    'lerp(x, y, 0.5)',
    'smoothstep(0.2, 0.8, x)',
    'smootherstep(0.2, 0.8, x)',
    'mapRange(x, 0, 1, -2, 2)',
    'crossfade(x, y, x, 0.2, 0.8)',
  ])('interpolation %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Anim.${expr}`)
  })

  it.each([
    'pingPong(x, 2)',
    'sinPulse(x, 2)',
  ])('continuous oscillator %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Anim.${expr}`)
  })

  it.each([
    'saw(x, 2)',
    'stagger(x, 1, 4)',
    'sequencePhase(x, 4)',
  ])('sawtooth %s matches fast (wrap-aware)', (expr) => {
    expectFidelityMatchesFast(`Anim.${expr}`, { wrap: true })
  })

  it.each([
    'ramp(x, 0.2, 0.8)',
    'follow(x, y, 16, 5)',
  ])('timing %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Anim.${expr}`)
  })

  // Step / quantised outputs: allow a one-quantum slip at a boundary that
  // fixed-point rounding may land on the far side of.
  it.each([
    ['squareWave(x, 2, 0.5)', 1],
    ['squareWave(x, 2)', 1],
    ['window01(x, 0.3, 0.7)', 1],
    ['steps(x, 4)', 0.25],
    ['sequenceStep(x, 4)', 1],
  ] as const)('step output %s matches fast within one quantum', (expr, quantum) => {
    expectFidelityMatchesFast(`Anim.${expr}`, { tol: quantum + 0.02 })
  })
})
