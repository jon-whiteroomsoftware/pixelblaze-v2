import { SOURCE_STOCK_MAPS, stockMapSpec } from './stockCatalogue'
import { evalMapSource } from './evalMapSource'
import {
  TETRA_FACES,
  TETRA_VERTICES,
  tetraShellNormals,
  tetraSurfaceRadius,
} from './tetraGeometry'
import type { Vec3 } from '../centroidNormals'

function mapById(id: string) {
  const m = SOURCE_STOCK_MAPS.find((m) => m.id === id)
  if (!m) throw new Error(`no stock map ${id}`)
  return m
}

// The Tetra tests work in the source's RAW geometry (centred at the origin),
// before the shared normalize pass, so a point's radius is directly comparable to
// the tetrahedron's ray-exit radius along its direction.
function rawCoords(id: string, count: number): number[][] {
  return evalMapSource(stockMapSpec(id)!.source, count)
}
function surfaceFractions(coords: number[][]): number[] {
  return coords.map((p) => {
    const r = Math.hypot(p[0], p[1], p[2])
    if (r === 0) return 0
    const u: Vec3 = [p[0] / r, p[1] / r, p[2] / r]
    return r / tetraSurfaceRadius(u)
  })
}

describe('tetra geometry', () => {
  it('has 4 vertices and 4 outward unit faces', () => {
    expect(TETRA_VERTICES).toHaveLength(4)
    expect(TETRA_FACES).toHaveLength(4)
    for (const f of TETRA_FACES) {
      expect(Math.hypot(...f.normal)).toBeCloseTo(1, 9)
      expect(f.offset).toBeGreaterThan(0) // plane faces away from the origin
    }
  })
})

describe('tetra shell (faceted 3D shell, ADR-0012)', () => {
  it('is a distinct, solid-eligible 3D map (not the volume)', () => {
    expect(mapById('tetra-shell').dim).toBe(3)
    expect(mapById('tetra-shell').normals).toBe('tetra')
    expect(mapById('tetra-shell').id).not.toBe(mapById('tetra-volume').id)
  })

  it('places every point ON the tetrahedron surface (radius == ray exit)', () => {
    for (const f of surfaceFractions(rawCoords('tetra-shell', 800))) {
      expect(f).toBeCloseTo(1, 6)
    }
  })

  it('yields exactly the 4 outward per-face normals (tetraShellNormals)', () => {
    const samples = mapById('tetra-shell').resolve(800).map((p) => p.sample as number[])
    const c = [0, 0, 0]
    for (const s of samples) for (let a = 0; a < 3; a++) c[a] += s[a]
    for (let a = 0; a < 3; a++) c[a] /= samples.length
    const normals = tetraShellNormals(samples as Vec3[])
    const distinct = new Set<string>()
    for (let i = 0; i < samples.length; i++) {
      const n = normals[i]
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6) // unit length
      // outward: agrees with the radial direction from the centre
      const d = [samples[i][0] - c[0], samples[i][1] - c[1], samples[i][2] - c[2]]
      expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeGreaterThan(0)
      distinct.add(n.map((v) => v.toFixed(3)).join(','))
    }
    // Faceted: every point resolves to one of the 4 faces, and all 4 are covered.
    expect(distinct.size).toBe(4)
  })
})

describe('tetra volume (filled solid, ADR-0012)', () => {
  it('is NOT solid-eligible', () => {
    expect(mapById('tetra-volume').normals).toBeUndefined()
  })

  it('fills the interior out to the boundary, never past it', () => {
    const fracs = surfaceFractions(rawCoords('tetra-volume', 2000))
    for (const f of fracs) expect(f).toBeLessThanOrEqual(1 + 1e-6)
    // The fill reaches the rim and the deep interior — not a shell.
    expect(Math.max(...fracs)).toBeGreaterThan(0.9)
    expect(Math.min(...fracs)).toBeLessThan(0.2)
    const inner = fracs.filter((f) => f < 0.5).length
    expect(inner / fracs.length).toBeGreaterThan(0.1)
  })
})
