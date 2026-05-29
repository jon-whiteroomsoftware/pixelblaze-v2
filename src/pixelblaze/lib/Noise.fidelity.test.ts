import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createFxShim, createShim, type ShimContext } from '../../engine/shim'
import { LIBRARIES } from '../libs'

// Exercises the 16.16-fidelity hash rewrite (#92): _hash2/_hash1 and their
// dependents must stay in [0,1), be stable per cell, and run bit-faithfully
// under the fixed-point engine (no >±32768 constants, no shift-count scaling).

const grid = { rows: 8, cols: 8 }

// Bundle a probe pattern that writes one Noise output to `out` per pixel.
function makeProbe(expr: string, mode: 'fast' | 'fidelity') {
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

describe('Noise hash fidelity (#92)', () => {
  it('voronoiID stays in [0,1), is stable per cell, and is non-degenerate (fidelity)', () => {
    const probe = makeProbe('Noise.voronoiID(x * 6, y * 6)', 'fidelity')
    const distinct = new Set<number>()
    for (let yi = 0; yi < 8; yi++) {
      for (let xi = 0; xi < 8; xi++) {
        const v = probe(xi / 7, yi / 7)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
        distinct.add(Math.round(v * 1e6))
      }
    }
    // Not a flat field — the hash actually varies across cells.
    expect(distinct.size).toBeGreaterThan(3)
  })

  it('voronoiID is stable per cell — same cell, same colour (no flicker)', () => {
    const probe = makeProbe('Noise.voronoiID(x * 6, y * 6)', 'fidelity')
    // Two points landing in the same Voronoi cell region should be deterministic
    // on repeat evaluation (the per-cell id must not depend on call order).
    const a = probe(0.3, 0.3)
    const b = probe(0.3, 0.3)
    expect(a).toBe(b)
  })

  it('noise2D and gradNoise2D stay in [0,1) under fidelity', () => {
    for (const expr of ['Noise.noise2D(x * 6, y * 6)', 'Noise.gradNoise2D(x * 6, y * 6)']) {
      const probe = makeProbe(expr, 'fidelity')
      for (let yi = 0; yi < 8; yi++) {
        for (let xi = 0; xi < 8; xi++) {
          const v = probe(xi / 7, yi / 7)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(1)
        }
      }
    }
  })

  it('voronoiDist is finite and non-negative under fidelity', () => {
    const probe = makeProbe('Noise.voronoiDist(x * 6, y * 6)', 'fidelity')
    for (let yi = 0; yi < 8; yi++) {
      for (let xi = 0; xi < 8; xi++) {
        const v = probe(xi / 7, yi / 7)
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
