import {
  SURFACES,
  FLAT,
  CYLINDER,
  cylinderDiameter,
  cylinderSurfacePoint,
  cylinderSurfacePositions,
  cylinderSurfaceNormal,
  cylinderSurfaceNormals,
} from './surfaces'

describe('surface catalogue', () => {
  it('offers only Flat (2D, identity) and Cylinder (3D wrap) — developable wraps (ADR-0012)', () => {
    expect(Object.keys(SURFACES)).toEqual(['flat', 'cylinder'])
    expect(FLAT).toMatchObject({ displayDim: 2, needsGrid: false, solidEligible: false })
    expect(CYLINDER).toMatchObject({ displayDim: 3, needsGrid: true, solidEligible: true })
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
