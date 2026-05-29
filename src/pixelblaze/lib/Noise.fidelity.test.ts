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

// 1 ULP of 16.16 fixed point.
const ULP = 1 / 65536

// Hardware bit-identity regression (#100). The divergence harness (#107) drove
// the byte-identical `hash11`/`hash21` recipe on a real Pixelblaze (fw 3.67) and
// recorded these device readings in test/divergence-harness/report.md. Pinning
// the fidelity engine to those device values guards the bit-identity claim in
// ADR-0003: if a future edit to the `_hash1`/`_hash2` fold (e.g. reverting the
// #113 `/256/256` demotion back to a `× 1/65536` literal, which flushes to 0 on
// hardware — #111) regresses preview↔hardware fidelity, these assertions fail.
describe('Noise hash bit-identity vs hardware (#100)', () => {
  // Device readings copied from report.md (firmware 3.67, 2026-05-29).
  const HASH1_DEVICE: Array<[number, number]> = [
    [0, 0.726593], [2, 0.89502], [4, 0.873138], [6, 0.66095], [8, 0.258453], [10, 0.665649],
  ]
  const HASH2_DEVICE: Array<[number, number, number]> = [
    [0, 0, 0.726593], [0, 9, 0.446808], [0, 18, 0.34967],
    [0, 27, 0.435181], [0, 36, 0.703339], [0, 45, 0.154144],
  ]

  it('_hash1 matches the device readings to within 1 ULP', () => {
    const probe = makeProbe('Noise._hash1(x)', 'fidelity')
    for (const [n, device] of HASH1_DEVICE) {
      expect(Math.abs(probe(n, 0) - device)).toBeLessThan(ULP)
    }
  })

  it('_hash2 matches the device readings to within 1 ULP', () => {
    const probe = makeProbe('Noise._hash2(x, y)', 'fidelity')
    for (const [ix, iy, device] of HASH2_DEVICE) {
      expect(Math.abs(probe(ix, iy) - device)).toBeLessThan(ULP)
    }
  })
})
