import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Fidelity sweep for SDF.js (#93). The shape primitives, boolean ops, and
// brightness mappings all work in the 0..1 grid with small products, so they
// are expected to be hardware-safe under the 16.16 fixed-point engine. This
// proves it: every probed expression is evaluated in both fast (float64) and
// fidelity (fixed-point) mode and the two must agree to fixed-point resolution.

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

// Sample over the grid (offset off exact centres to dodge atan2(0,0) etc.) and
// assert the fidelity result tracks fast-preview to fixed-point tolerance.
const SAMPLES = [0.03, 0.27, 0.49, 0.51, 0.73, 0.97]
function expectFidelityMatchesFast(expr: string, tol = 0.02) {
  const fast = probe(expr, 'fast')
  const fid = probe(expr, 'fidelity')
  for (const x of SAMPLES) {
    for (const y of SAMPLES) {
      const f = fast(x, y)
      const d = fid(x, y)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeCloseTo(f, 0) // coarse magnitude guard
      expect(Math.abs(d - f)).toBeLessThanOrEqual(tol)
    }
  }
}

describe('SDF.js fidelity sweep (#93)', () => {
  it.each([
    ['circle(x, y, 0.5, 0.5, 0.3)'],
    ['rect(x, y, 0.5, 0.5, 0.3, 0.2)'],
    ['square(x, y, 0.5, 0.5, 0.25)'],
    ['polygon(x, y, 0.5, 0.5, 0.3, 5)'],
    ['triangle(x, y, 0.5, 0.5, 0.3)'],
    ['segment(x, y, 0.2, 0.2, 0.8, 0.8)'],
    ['line(x, y, 0.2, 0.2, 0.8, 0.8)'],
    ['ring(x, y, 0.5, 0.5, 0.3, 0.05)'],
    ['star(x, y, 0.5, 0.5, 0.3, 5, 0.4)'],
    ['pie(x, y, 0.5, 0.5, 0.3, 0.8)'],
    ['cross(x, y, 0.5, 0.5, 0.3, 0.08)'],
  ])('primitive %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`SDF.${expr}`)
  })

  it.each([
    ['union(SDF.circle(x,y,0.4,0.5,0.2), SDF.circle(x,y,0.6,0.5,0.2))'],
    ['intersect(SDF.circle(x,y,0.4,0.5,0.2), SDF.circle(x,y,0.6,0.5,0.2))'],
    ['subtract(SDF.circle(x,y,0.5,0.5,0.3), SDF.circle(x,y,0.5,0.5,0.15))'],
    ['smoothUnion(SDF.circle(x,y,0.4,0.5,0.2), SDF.circle(x,y,0.6,0.5,0.2), 0.1)'],
    ['smoothSubtract(SDF.circle(x,y,0.5,0.5,0.3), SDF.circle(x,y,0.5,0.5,0.15), 0.1)'],
    ['offset(SDF.circle(x,y,0.5,0.5,0.3), 0.05)'],
    ['annular(SDF.circle(x,y,0.5,0.5,0.3), 0.05)'],
  ])('boolean op %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`SDF.${expr}`)
  })

  it.each([
    ['fill(SDF.circle(x,y,0.5,0.5,0.3))'],
    ['softFill(SDF.circle(x,y,0.5,0.5,0.3), 0.05)'],
    ['glow(SDF.circle(x,y,0.5,0.5,0.3), 0.1)'],
    ['fillGlow(SDF.circle(x,y,0.5,0.5,0.3), 0.1)'],
    ['border(SDF.circle(x,y,0.5,0.5,0.3), 0.05)'],
    ['bands(SDF.circle(x,y,0.5,0.5,0.3), 0.1)'],
  ])('brightness mapping %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`SDF.${expr}`)
  })
})
