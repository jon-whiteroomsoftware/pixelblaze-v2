import { SOURCE_STOCK_MAPS, STOCK_MAP_SPECS, SEED_MAP_IDS, stockMapSpec } from './stockCatalogue'
import { squarePlaneDims } from './plane'

function mapById(id: string) {
  const m = SOURCE_STOCK_MAPS.find((m) => m.id === id)
  if (!m) throw new Error(`no stock map ${id}`)
  return m
}

describe('stock catalogue', () => {
  it('pairs each stock id with metadata and a non-empty raw source', () => {
    expect(STOCK_MAP_SPECS.map((s) => s.id)).toEqual([
      'plane',
      'wide',
      'cube',
      'cube-shell',
      'star',
      'seed-helix-3d',
      'seed-sphere-3d',
      'seed-ring-2d',
    ])
    for (const s of STOCK_MAP_SPECS) {
      expect(s.source).toMatch(/function\s*\(/)
    }
  })

  it('excludes the drape cylinder (no faithful source — ADR-0008 exception)', () => {
    expect(stockMapSpec('cylinder')).toBeUndefined()
  })

  it('builds live builtin maps of the declared dimensionality', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.builtin).toBe(true)
      expect(m.bakedCount).toBeUndefined()
    }
    expect(mapById('plane').dim).toBe(2)
    expect(mapById('cube').dim).toBe(3)
    expect(mapById('seed-ring-2d').dim).toBe(2)
    expect(mapById('seed-helix-3d').dim).toBe(3)
    expect(mapById('seed-sphere-3d').dim).toBe(3)
  })

  it('flags the convex Sphere shell and the faceted Cube shell solid-eligible (ADR-0011/0012)', () => {
    // The Sphere vouches a centroid normal is honest; the Cube shell carries per-
    // face normals. The Helix (not a shell), the volume Cube and every other stock
    // map carry no flag and stay see-through.
    expect(mapById('seed-sphere-3d').solidEligible).toBe(true)
    expect(mapById('cube-shell').solidEligible).toBe(true)
    expect(mapById('seed-helix-3d').solidEligible).toBeUndefined()
    expect(mapById('cube').solidEligible).toBeUndefined()
    expect(mapById('plane').solidEligible).toBeUndefined()
  })

  it('exposes the relocated cloud ids for IDB pruning', () => {
    expect(SEED_MAP_IDS).toEqual(['seed-helix-3d', 'seed-sphere-3d', 'seed-ring-2d'])
  })
})

describe('source regeneration', () => {
  it('regenerates exactly pixelCount points for any count (no baked replay)', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.resolve(7)).toHaveLength(7)
      expect(m.resolve(200)).toHaveLength(200)
    }
  })

  it('normalizes every coordinate into [0,1] per axis', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      for (const pt of m.resolve(120)) {
        for (const c of pt.sample) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
        expect(pt.pos).toEqual(pt.sample)
      }
    }
  })

  it('clouds do not origin-snap on a count bump (live, not frozen)', () => {
    // A baked cloud would pad past its frozen length with the origin; a live one
    // never does — the last point is real geometry at any count.
    const ring = mapById('seed-ring-2d').resolve(300)
    const last = ring[ring.length - 1].pos!
    expect(last).not.toEqual([0, 0])
  })
})

describe('plane no-regression (byte-stable 2D baseline)', () => {
  it('reproduces the legacy grid x = col/(cols-1), y = row/(rows-1)', () => {
    const plane = mapById('plane')
    for (const count of [1024, 256, 99, 1]) {
      const { cols, rows } = squarePlaneDims(count)
      const pts = plane.resolve(count)
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = cols > 1 ? col / (cols - 1) : 0
        const y = rows > 1 ? row / (rows - 1) : 0
        expect(pts[i].sample).toEqual([x, y])
      }
    }
  })
})

describe('wide grid', () => {
  it('lays out roughly twice as wide as it is tall', () => {
    const wide = mapById('wide')
    for (const count of [200, 512, 1024]) {
      const pts = wide.resolve(count)
      const xs = pts.map((p) => p.sample[0])
      const ys = pts.map((p) => p.sample[1])
      const wSpan = Math.max(...xs) - Math.min(...xs)
      const hSpan = Math.max(...ys) - Math.min(...ys)
      // Normalize anchors the longest (wide) axis to 1.0; the short axis lands near
      // 0.5, i.e. the grid is about 2:1.
      expect(wSpan).toBeCloseTo(1, 5)
      expect(hSpan).toBeGreaterThan(0.4)
      expect(hSpan).toBeLessThan(0.65)
    }
  })
})

describe('star (stellated polyhedron)', () => {
  it('is a 3D map whose points lie on the star wireframe', () => {
    const star = mapById('star')
    expect(star.dim).toBe(3)
    const pts = star.resolve(360)
    expect(pts).toHaveLength(360)
    // Every point is a real 3D coordinate in [0,1] (normalize), pos == sample.
    for (const p of pts) {
      expect(p.sample).toHaveLength(3)
      expect(p.pos).toEqual(p.sample)
    }
  })

  it('reaches 20 spike tips standing out beyond the body', () => {
    const star = mapById('star')
    const pts = star.resolve(2000)
    // The spike tips are the farthest points from the centre; the body corners sit
    // closer in. Collect the distinct outward directions of the farthest points and
    // confirm there are 20 (one per icosahedron face).
    const c = [0.5, 0.5, 0.5]
    const radius = (p: number[]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])
    const maxR = Math.max(...pts.map((p) => radius(p.sample)))
    const tips = new Set<string>()
    for (const p of pts) {
      const r = radius(p.sample)
      if (r < maxR - 1e-6) continue
      const dir = [p.sample[0] - c[0], p.sample[1] - c[1], p.sample[2] - c[2]].map((v) => v / r)
      tips.add(dir.map((v) => v.toFixed(2)).join(','))
    }
    expect(tips.size).toBe(20)
  })
})

describe('cube lattice', () => {
  it('orders x-fastest then y then z and spans corner to corner', () => {
    const cube = mapById('cube')
    const pts = cube.resolve(64) // side 4
    expect(pts[0].pos).toEqual([0, 0, 0])
    expect(pts[63].pos).toEqual([1, 1, 1])
    expect(pts[1].pos).toEqual([1 / 3, 0, 0])
    expect(pts[4].pos).toEqual([0, 1 / 3, 0])
    expect(pts[16].pos).toEqual([0, 0, 1 / 3])
  })

  it('collapses a degenerate single-cell lattice to the origin (shared normalize)', () => {
    const cube = mapById('cube')
    expect(cube.resolve(1)[0].pos).toEqual([0, 0, 0])
  })
})

describe('cube shell (faceted 3D shell, ADR-0012)', () => {
  const onAFace = (c: number) => Math.abs(c) < 1e-9 || Math.abs(c - 1) < 1e-9

  it('is a distinct 3D map from the volume cube', () => {
    expect(mapById('cube-shell').dim).toBe(3)
    expect(mapById('cube-shell').id).not.toBe(mapById('cube').id)
  })

  it('places every point ON a cube face (one axis pinned to 0 or 1, others interior)', () => {
    for (const { pos } of mapById('cube-shell').resolve(120)) {
      const pinned = pos!.filter(onAFace)
      // at least one axis sits on a face; the others stay strictly inside
      expect(pinned.length).toBeGreaterThanOrEqual(1)
      for (const c of pos!) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })

  it('covers all six faces for a count that fills them', () => {
    const faces = new Set<string>()
    for (const { pos } of mapById('cube-shell').resolve(120)) {
      pos!.forEach((c, axis) => {
        if (Math.abs(c) < 1e-9) faces.add(`-${axis}`)
        if (Math.abs(c - 1) < 1e-9) faces.add(`+${axis}`)
      })
    }
    expect(faces.size).toBe(6)
  })

  it('keeps in-face offsets strictly inside (cell centres, never on an edge)', () => {
    // exactly one coordinate pinned to a face; the other two strictly between 0,1
    for (const { pos } of mapById('cube-shell').resolve(96)) {
      const interior = pos!.filter((c) => !onAFace(c))
      for (const c of interior) {
        expect(c).toBeGreaterThan(0)
        expect(c).toBeLessThan(1)
      }
    }
  })
})
