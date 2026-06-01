import {
  SURFACES,
  FLAT,
  CYLINDER,
  SURFACE_CUBE,
  cylinderDiameter,
  cylinderSurfacePoint,
  cylinderSurfacePositions,
  cylinderSurfaceNormal,
  cylinderSurfaceNormals,
  surfaceCubeFaceCounts,
  surfaceCubePoints,
  surfaceCubePositions,
  surfaceCubeNormals,
} from './surfaces'

describe('surface catalogue', () => {
  it('offers Flat (2D, identity), Cylinder and surface cube (3D embeddings)', () => {
    expect(Object.keys(SURFACES)).toEqual(['flat', 'cylinder', 'surface-cube'])
    expect(FLAT).toMatchObject({ displayDim: 2, needsGrid: false, solidEligible: false })
    expect(CYLINDER).toMatchObject({ displayDim: 3, needsGrid: true, solidEligible: true })
    expect(SURFACE_CUBE).toMatchObject({ displayDim: 3, needsGrid: true, solidEligible: true })
  })

  it('flags the surface cube solid-eligible (it supplies a face normal)', () => {
    expect(SURFACE_CUBE.solidEligible).toBe(true)
  })
})

describe('cylinderDiameter (map-derived shape)', () => {
  it('wraps a square grid to a tall slender tube (~π:1 height:diameter)', () => {
    // cols=rows → diameter ≈ 1/π of the unit height.
    const d = cylinderDiameter({ cols: 64, rows: 64 })
    expect(d).toBeGreaterThan(0.3)
    expect(d).toBeLessThan(0.34)
  })

  it('wraps a 2:1 grid to a fatter, shorter tube than the square', () => {
    const square = cylinderDiameter({ cols: 64, rows: 64 })
    const wide = cylinderDiameter({ cols: 128, rows: 64 })
    expect(wide).toBeGreaterThan(square)
    // 2:1 → diameter ≈ 2/π.
    expect(wide).toBeGreaterThan(0.6)
    expect(wide).toBeLessThan(0.66)
  })
})

describe('cylinderSurfacePoint', () => {
  it('draws a 3D position from a cols×rows grid', () => {
    expect(cylinderSurfacePoint(0, { cols: 4, rows: 4 })).toHaveLength(3)
  })

  it('wraps the circumference: col 0 sits at angle 0 on the +x seam', () => {
    const [x, , z] = cylinderSurfacePoint(0, { cols: 4, rows: 4 })
    const rho = 4 / (2 * Math.PI * 3)
    expect(x).toBeCloseTo(0.5 + rho)
    expect(z).toBeCloseTo(0.5)
  })

  it('climbs y with the row (height channel)', () => {
    const lo = cylinderSurfacePoint(0, { cols: 2, rows: 3 }) // row 0
    const hi = cylinderSurfacePoint(4, { cols: 2, rows: 3 }) // row 2
    expect(lo[1]).toBeCloseTo(0)
    expect(hi[1]).toBeCloseTo(1)
  })

  it('reproduces the seam gap (last column is one step short of the first)', () => {
    // col index wraps over `cols`, not `cols-1`, so there's no doubled seam.
    const first = cylinderSurfacePoint(0, { cols: 4, rows: 2 })
    const last = cylinderSurfacePoint(3, { cols: 4, rows: 2 })
    expect(last[0]).not.toBeCloseTo(first[0])
    expect(last[2]).not.toBeCloseTo(first[2])
  })
})

describe('cylinderSurfacePositions', () => {
  it('resolves one 3D position per modeled index', () => {
    expect(cylinderSurfacePositions(16, { cols: 4, rows: 4 })).toHaveLength(16)
  })
})

describe('cylinderSurfaceNormal', () => {
  it('points radially outward from the tube axis (unit length, no y)', () => {
    for (let i = 0; i < 16; i++) {
      const n = cylinderSurfaceNormal(i, { cols: 4, rows: 4 })
      expect(Math.hypot(...n)).toBeCloseTo(1)
      expect(n[1]).toBe(0)
    }
  })

  it('aligns with the radial offset from the axis', () => {
    const [x, , z] = cylinderSurfacePoint(1, { cols: 8, rows: 4 })
    const n = cylinderSurfaceNormal(1, { cols: 8, rows: 4 })
    // outward radial: (pos.xz − centre.xz) normalized equals the normal
    const rx = x - 0.5
    const rz = z - 0.5
    const len = Math.hypot(rx, rz)
    expect(n[0]).toBeCloseTo(rx / len)
    expect(n[2]).toBeCloseTo(rz / len)
  })

  it('emits one normal per index', () => {
    expect(cylinderSurfaceNormals(16, { cols: 4, rows: 4 })).toHaveLength(16)
  })
})

describe('surfaceCubeFaceCounts', () => {
  it('splits the count evenly across six faces, sums back to the total', () => {
    const counts = surfaceCubeFaceCounts(60)
    expect(counts).toEqual([10, 10, 10, 10, 10, 10])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(60)
  })

  it('hands the remainder to the first faces', () => {
    const counts = surfaceCubeFaceCounts(62)
    expect(counts).toEqual([11, 11, 10, 10, 10, 10])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(62)
  })
})

describe('surfaceCubePoints', () => {
  it('emits one position + normal per index', () => {
    const pts = surfaceCubePoints(60)
    expect(pts).toHaveLength(60)
    expect(surfaceCubePositions(60)).toHaveLength(60)
    expect(surfaceCubeNormals(60)).toHaveLength(60)
  })

  it('places every point ON a cube face (a coordinate pinned to 0 or 1)', () => {
    for (const { pos } of surfaceCubePoints(120)) {
      const onAFace = pos.some((c) => Math.abs(c) < 1e-9 || Math.abs(c - 1) < 1e-9)
      expect(onAFace).toBe(true)
      // and strictly inside the unit cube on the other axes
      for (const c of pos) {
        expect(c).toBeGreaterThanOrEqual(-1e-9)
        expect(c).toBeLessThanOrEqual(1 + 1e-9)
      }
    }
  })

  it('emits unit normals that are the outward dominant axis of pos − centre', () => {
    for (const { pos, normal } of surfaceCubePoints(120)) {
      // unit length
      const len = Math.hypot(...normal)
      expect(len).toBeCloseTo(1)
      // axis-aligned: exactly one non-zero component, ±1
      const nonZero = normal.filter((c) => c !== 0)
      expect(nonZero).toHaveLength(1)
      expect(Math.abs(nonZero[0])).toBe(1)
      // points outward: aligned with pos − centre on its dominant axis
      const centred = pos.map((c) => c - 0.5)
      const axis = normal.findIndex((c) => c !== 0)
      expect(Math.sign(centred[axis])).toBe(Math.sign(normal[axis]))
    }
  })

  it('covers all six faces (both signs of all three axes)', () => {
    const seen = new Set(surfaceCubeNormals(60).map((n) => n.join(',')))
    expect(seen).toEqual(
      new Set(['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']),
    )
  })

  it('keeps points off the shared edges (face-interior cell centres)', () => {
    // every coordinate that is not the pinned 0/1 sits strictly between them
    for (const { pos, normal } of surfaceCubePoints(96)) {
      const axis = normal.findIndex((c) => c !== 0)
      pos.forEach((c, i) => {
        if (i === axis) return
        expect(c).toBeGreaterThan(0)
        expect(c).toBeLessThan(1)
      })
    }
  })
})
