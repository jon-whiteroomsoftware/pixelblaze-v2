import { SOURCE_STOCK_MAPS, STOCK_MAP_SPECS, SEED_MAP_IDS, stockMapSpec } from './stockCatalogue'
import { squarePlaneDims, widePlaneDims } from './plane'
import { STAR_FACES, starShellNormals, starSurfaceRadius } from './starGeometry'
import { evalMapSource } from './evalMapSource'

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
      'panel-winding',
      'cube',
      'cube-shell',
      'star-shell',
      'star-volume',
      'seed-sphere-3d',
      'sphere-volume',
      'tetra-shell',
      'tetra-volume',
      'seed-ring-2d',
    ])
    for (const s of STOCK_MAP_SPECS) {
      expect(s.source).toMatch(/function\s*\(/)
    }
  })

  it('excludes the drape cylinder (no faithful source)', () => {
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
    expect(mapById('seed-sphere-3d').dim).toBe(3)
  })

  it('ships each shell its normal recipe, so eligibility lives in the catalogue', () => {
    // The Sphere vouches a centroid normal is honest; the Cube shell carries per-
    // face normals; the Star shell its stellation faces. The recipe's PRESENCE is
    // the solid-eligibility gate. The volume Cube and every other stock map carry
    // no recipe and stay see-through.
    expect(mapById('seed-sphere-3d').normals).toBe('centroid')
    expect(mapById('cube-shell').normals).toBe('face')
    expect(mapById('star-shell').normals).toBe('star')
    expect(mapById('cube').normals).toBeUndefined()
    expect(mapById('plane').normals).toBeUndefined()
    // A volume has no per-point boundary normal, so a solid ball / solid star is
    // never solid-eligible — it leans on the renderer's depth-tested opaque cores.
    expect(mapById('sphere-volume').normals).toBeUndefined()
    expect(mapById('star-volume').normals).toBeUndefined()
    // The Tetra joins the scheme: shell carries per-face normals, volume does not.
    expect(mapById('tetra-shell').normals).toBe('tetra')
    expect(mapById('tetra-volume').normals).toBeUndefined()
  })

  it('derives a wrappable grid live from the count, null for everything else', () => {
    // The Square squares up; the Wide runs 2:1 — both from the count, mirroring
    // their `.js` sources, so the cylinder wrap and layout readout read the grid
    // off the map with no provenance switch.
    expect(mapById('plane').gridDims(100)).toEqual(squarePlaneDims(100))
    expect(mapById('panel-winding').gridDims(100)).toEqual(squarePlaneDims(100))
    expect(mapById('wide').gridDims(100)).toEqual(widePlaneDims(100))
    // The volumetric cube is a regular side³ lattice, so it reports cols×rows×depth
    // (512 = 8³). An irregular 2D cloud and the shells still expose no clean lattice.
    expect(mapById('cube').gridDims(512)).toEqual({ cols: 8, rows: 8, depth: 8 })
    expect(mapById('seed-ring-2d').gridDims(60)).toBeNull()
  })

  it('exposes the relocated cloud ids for IDB pruning', () => {
    expect(SEED_MAP_IDS).toEqual(['seed-sphere-3d', 'seed-ring-2d'])
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

// The Star tests work in the source's RAW geometry (centred at the origin),
// before the shared normalize pass, so a point's radius is directly comparable to
// the stellated surface's ray-exit radius along its direction — no normalization
// scale to untangle. `starSurfaceRadius` is the distance to the one triangle a
// ray from the origin passes through.
function rawCoords(id: string, count: number): number[][] {
  return evalMapSource(stockMapSpec(id)!.source, count)
}
// For each raw coord: the fraction of the way from the origin to the surface
// along its direction (1.0 == exactly on the surface).
function surfaceFractions(coords: number[][]): number[] {
  return coords.map((p) => {
    const r = Math.hypot(p[0], p[1], p[2])
    if (r === 0) return 0
    const u: [number, number, number] = [p[0] / r, p[1] / r, p[2] / r]
    return r / starSurfaceRadius(u)
  })
}

describe('star shell (stellated surface)', () => {
  it('is a distinct, solid-eligible 3D map (not the volume)', () => {
    expect(mapById('star-shell').dim).toBe(3)
    expect(mapById('star-shell').normals).toBe('star')
    expect(mapById('star-shell').id).not.toBe(mapById('star-volume').id)
  })

  it('retires the wireframe star id', () => {
    expect(stockMapSpec('star')).toBeUndefined()
  })

  it('places every point ON the stellated surface (radius == ray exit)', () => {
    // Every surface point's radius equals the ray's exit radius through the solid,
    // so its fraction is 1.0.
    for (const f of surfaceFractions(rawCoords('star-shell', 1200))) {
      expect(f).toBeCloseTo(1, 6)
    }
  })

  it('yields faceted, outward per-face normals (starShellNormals)', () => {
    const samples = mapById('star-shell').resolve(1200).map((p) => p.sample)
    // centroid of the normalized samples
    const c = [0, 0, 0]
    for (const s of samples) for (let a = 0; a < 3; a++) c[a] += s[a]
    for (let a = 0; a < 3; a++) c[a] /= samples.length
    const normals = starShellNormals(samples as [number, number, number][])
    const distinct = new Set<string>()
    for (let i = 0; i < samples.length; i++) {
      const n = normals[i]
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6) // unit length
      // outward: agrees with the radial direction from the centre
      const d = [samples[i][0] - c[0], samples[i][1] - c[1], samples[i][2] - c[2]]
      expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeGreaterThan(0)
      distinct.add(n.map((v) => v.toFixed(3)).join(','))
    }
    // Many distinct face normals — a faceted shell, not a smooth sphere.
    expect(distinct.size).toBeGreaterThan(20)
  })

  it('exposes all 60 stellation faces', () => {
    expect(STAR_FACES).toHaveLength(60)
  })
})

describe('star volume (filled stellated solid)', () => {
  it('is NOT solid-eligible', () => {
    expect(mapById('star-volume').normals).toBeUndefined()
  })

  it('fills the interior out to the spiky boundary, never past it', () => {
    const fracs = surfaceFractions(rawCoords('star-volume', 2000))
    // No point escapes the stellated surface.
    for (const f of fracs) expect(f).toBeLessThanOrEqual(1 + 1e-6)
    // The fill reaches the rim and the deep interior — not a shell.
    expect(Math.max(...fracs)).toBeGreaterThan(0.9)
    expect(Math.min(...fracs)).toBeLessThan(0.2)
    // A healthy fraction sit well inside the outer half.
    const inner = fracs.filter((f) => f < 0.5).length
    expect(inner / fracs.length).toBeGreaterThan(0.1)
  })
})

describe('2D panel winding', () => {
  it('snakes by column on a 16x16 panel', () => {
    const pts = mapById('panel-winding').resolve(256)

    expect(pts[0].pos).toEqual([0, 0])
    expect(pts[15].pos).toEqual([0, 1])
    expect(pts[16].pos).toEqual([1 / 15, 1])
    expect(pts[31].pos).toEqual([1 / 15, 0])
    expect(pts[32].pos).toEqual([2 / 15, 0])
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

describe('cube shell (faceted 3D shell)', () => {
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

describe('sphere volume (solid ball)', () => {
  // The cloud's own centroid is the ball centre; radius is the distance from it.
  function centroidOf(pts: number[][]) {
    const c = [0, 0, 0]
    for (const p of pts) for (let a = 0; a < 3; a++) c[a] += p[a]
    return c.map((v) => v / pts.length)
  }
  const radiusFrom = (c: number[]) => (p: number[]) =>
    Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])

  it('is a distinct 3D map from the Sphere shell', () => {
    expect(mapById('sphere-volume').dim).toBe(3)
    expect(mapById('sphere-volume').id).not.toBe(mapById('seed-sphere-3d').id)
  })

  it('fills the interior: points span a range of radii, not just the shell', () => {
    const samples = mapById('sphere-volume').resolve(2000).map((p) => p.sample)
    const radius = radiusFrom(centroidOf(samples))
    const radii = samples.map(radius)
    const maxR = Math.max(...radii)
    const minR = Math.min(...radii)
    // A genuine fill reaches the centre and the rim — the shell would pin every
    // radius near the max.
    expect(minR).toBeLessThan(maxR * 0.1)
    // Points are spread across radii, not bunched at the surface: a healthy
    // fraction sit inside the outer half-radius.
    const inner = radii.filter((r) => r < maxR * 0.5).length
    expect(inner / radii.length).toBeGreaterThan(0.1)
  })

  it('stays within the unit ball after normalization', () => {
    const pts = mapById('sphere-volume').resolve(500)
    const radius = radiusFrom(centroidOf(pts.map((p) => p.sample)))
    for (const { sample, pos } of pts) {
      // radius from the ball centre stays near the normalized half-extent; the
      // slack absorbs per-axis offsets from aspect normalization anchoring to the
      // single longest axis (finite sampling makes the ball's extents slightly
      // non-cubic). The hard guarantee is the [0,1] per-axis bound checked below.
      expect(radius(sample)).toBeLessThanOrEqual(0.55)
      for (const c of sample) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
      expect(pos).toEqual(sample)
    }
  })
})
