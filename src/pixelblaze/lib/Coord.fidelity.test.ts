import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Fidelity sweep for Coord.js (#93). Polar, rotation, scale, mirror, tiling,
// domain-repeat, symmetry, remap, and skew helpers all operate on small 0..1
// coordinates. This proves each tracks fast-preview under the 16.16 engine.
// Angle-valued helpers (0..1 wrap) are compared modulo 1 so a wrap seam where
// fast lands at 0.999 and fidelity at 0.001 isn't a false divergence.

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

// Circular |fast - fid| for values living on the 0..1 ring.
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

describe('Coord.js fidelity sweep (#93)', () => {
  it.each([
    'polarAngle(x, y)',
    'angleFrom(x, y, 0.3, 0.7)',
  ])('polar angle %s matches fast (wrap-aware)', (expr) => {
    expectFidelityMatchesFast(`Coord.${expr}`, { wrap: true })
  })

  it.each([
    'polarRadius(x, y)',
    'radiusFrom(x, y, 0.3, 0.7)',
    'rotateX(x, y, 0.5, 0.5, 1.1)',
    'rotateY(x, y, 0.5, 0.5, 1.1)',
    'scaleX(x, 0.5, 1.6)',
    'scaleY(y, 0.5, 1.6)',
    'mirrorX(x)',
    'mirrorY(y)',
    'mirrorAround(x, 0.4)',
    'remap(x, 0, 1, -2, 2)',
    'skewX(x, y, 0.5)',
    'skewY(x, y, 0.5)',
  ])('transform %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Coord.${expr}`)
  })

  it.each([
    'tile(x, 4)',
    'tileCell(x, 4)',
    'tileMirror(x, 4)',
    'repeatX(x, 0.3)',
    'repeatY(y, 0.3)',
  ])('tiling %s matches fast under fidelity', (expr) => {
    expectFidelityMatchesFast(`Coord.${expr}`)
  })

  it.each([
    'sectorAngle(x, 6)',
    'foldAngle(x, 6)',
  ])('symmetry %s matches fast (wrap-aware)', (expr) => {
    expectFidelityMatchesFast(`Coord.${expr}`, { wrap: true })
  })
})
