import {
  canvasSize,
  clampGridDim,
  clampPixelCount,
  fitSpacing,
  MAX_GRID_AXIS,
  MAX_PIXEL_COUNT,
  pointSize,
  projectIndex,
  type Locked2DGrid,
  DEFAULT_ORBIT,
  MAX_ELEVATION,
  clampElevation,
  orbitRotate,
  fit3DScale,
  FIT_3D_MARGIN,
  projectOrbit,
  depthCue,
  applyTurntableDrag,
  applyTrackballDrag,
  advanceAutoOrbit,
  type OrbitCamera,
} from './camera'

describe('camera — freeze guard', () => {
  it('caps total pixel count at 65,536', () => {
    expect(MAX_PIXEL_COUNT).toBe(65536)
    expect(clampPixelCount(1_000_000)).toBe(65536)
    expect(clampPixelCount(100)).toBe(100)
  })

  it('keeps a sane per-axis generator cap at 256', () => {
    expect(MAX_GRID_AXIS).toBe(256)
    expect(clampGridDim(1000)).toBe(256)
    expect(clampGridDim(32)).toBe(32)
  })

  it('clamps non-positive / non-finite to 1', () => {
    expect(clampGridDim(0)).toBe(1)
    expect(clampGridDim(NaN)).toBe(1)
    expect(clampPixelCount(0)).toBe(1)
  })
})

describe('camera — fit-to-container & sizing', () => {
  it('derives spacing so cols fill the container width', () => {
    expect(fitSpacing(640, 32)).toBe(20)
    expect(fitSpacing(100, 1)).toBe(100)
  })

  it('never produces a sub-pixel spacing', () => {
    expect(fitSpacing(10, 1000)).toBe(1)
  })

  it('sizes the canvas to cols×rows of dots at spacing apart', () => {
    expect(canvasSize({ rows: 16, cols: 32, spacing: 20 })).toEqual({ width: 640, height: 320 })
  })

  it('point size matches the dot diameter (dots just touch)', () => {
    expect(pointSize({ rows: 8, cols: 8, spacing: 20 })).toBe(20)
    expect(pointSize({ rows: 8, cols: 8, spacing: 0.4 })).toBe(1)
  })
})

describe('camera — locked-2D projection', () => {
  const grid: Locked2DGrid = { rows: 2, cols: 2, spacing: 20 }

  it('maps the default grid to the expected clip-space layout', () => {
    // Dot centres at fractions (0.25, 0.75) of each axis; y is flipped (up).
    expect(projectIndex(0, grid)).toEqual([-0.5, 0.5]) // col 0, row 0 (top-left)
    expect(projectIndex(1, grid)).toEqual([0.5, 0.5]) // col 1, row 0 (top-right)
    expect(projectIndex(2, grid)).toEqual([-0.5, -0.5]) // col 0, row 1 (bottom-left)
    expect(projectIndex(3, grid)).toEqual([0.5, -0.5]) // col 1, row 1 (bottom-right)
  })

  it('returns null for indices beyond the grid row count', () => {
    expect(projectIndex(4, grid)).toBeNull()
  })

  it('is coordinate-identical to the legacy cx = col*spacing + spacing/2 centres', () => {
    const g: Locked2DGrid = { rows: 4, cols: 8, spacing: 13 }
    const { width, height } = canvasSize(g)
    for (let i = 0; i < g.rows * g.cols; i++) {
      const col = i % g.cols
      const row = Math.floor(i / g.cols)
      const cx = col * g.spacing + g.spacing / 2
      const cy = row * g.spacing + g.spacing / 2
      const expected: [number, number] = [(cx / width) * 2 - 1, 1 - (cy / height) * 2]
      const got = projectIndex(i, g)!
      expect(got[0]).toBeCloseTo(expected[0], 10)
      expect(got[1]).toBeCloseTo(expected[1], 10)
    }
  })

  it('projection is independent of spacing (spacing only scales the canvas)', () => {
    expect(projectIndex(1, { rows: 2, cols: 2, spacing: 20 })).toEqual(
      projectIndex(1, { rows: 2, cols: 2, spacing: 5 })
    )
  })
})

describe('camera — orbit rotation', () => {
  const identity: OrbitCamera = { azimuth: 0, elevation: 0, roll: 0 }

  it('is the identity at zero azimuth/elevation/roll', () => {
    const p: [number, number, number] = [0.2, -0.3, 0.4]
    const r = orbitRotate(p, identity)
    expect(r[0]).toBeCloseTo(0.2, 10)
    expect(r[1]).toBeCloseTo(-0.3, 10)
    expect(r[2]).toBeCloseTo(0.4, 10)
  })

  it('preserves length (rotation is rigid)', () => {
    const p: [number, number, number] = [0.5, -0.5, 0.5]
    const len = Math.hypot(...p)
    const r = orbitRotate(p, { azimuth: 1.1, elevation: -0.7, roll: 0.4 })
    expect(Math.hypot(...r)).toBeCloseTo(len, 10)
  })

  it('azimuth spins about the vertical axis (y unchanged)', () => {
    const r = orbitRotate([0.5, 0.25, 0], { azimuth: Math.PI / 2, elevation: 0, roll: 0 })
    expect(r[1]).toBeCloseTo(0.25, 10) // vertical component untouched
  })
})

describe('camera — elevation clamp', () => {
  it('clamps plain-drag elevation to a stable horizon', () => {
    expect(clampElevation(Math.PI)).toBeCloseTo(MAX_ELEVATION, 10)
    expect(clampElevation(-Math.PI)).toBeCloseTo(-MAX_ELEVATION, 10)
    expect(clampElevation(0.3)).toBeCloseTo(0.3, 10)
  })
})

describe('camera — 3D fit-to-container', () => {
  it('scales so the worst-case rotated extent maps within the margin', () => {
    const scale = fit3DScale()
    // A unit-cube corner sits at the half-diagonal; after scaling it must land
    // exactly on the margin, never outside clip space.
    const corner: [number, number, number] = [1, 1, 1]
    const { clip } = projectOrbit(corner, { azimuth: 0, elevation: 0, roll: 0 }, scale)
    const extent = Math.hypot(clip[0], clip[1])
    expect(extent).toBeLessThanOrEqual(FIT_3D_MARGIN + 1e-9)
  })

  it('keeps every point inside clip space under arbitrary rotation', () => {
    const scale = fit3DScale()
    const cam: OrbitCamera = { azimuth: 1.3, elevation: -0.9, roll: 0.5 }
    for (const pos of [[0, 0, 0], [1, 0, 1], [0, 1, 0], [1, 1, 1]] as [number, number, number][]) {
      const { clip } = projectOrbit(pos, cam, scale)
      expect(Math.abs(clip[0])).toBeLessThanOrEqual(FIT_3D_MARGIN + 1e-9)
      expect(Math.abs(clip[1])).toBeLessThanOrEqual(FIT_3D_MARGIN + 1e-9)
    }
  })
})

describe('camera — depth cueing', () => {
  it('nearer dots are brighter and larger than farther ones', () => {
    const half = 0.5 * Math.sqrt(3)
    const near = depthCue(half)
    const far = depthCue(-half)
    expect(near.brightnessMul).toBeGreaterThan(far.brightnessMul)
    expect(near.sizeMul).toBeGreaterThan(far.sizeMul)
    expect(near.brightnessMul).toBeCloseTo(1, 10)
  })

  it('clamps out-of-range depth', () => {
    expect(depthCue(99).brightnessMul).toBeCloseTo(depthCue(10).brightnessMul, 10)
  })
})

describe('camera — orbit interaction', () => {
  it('turntable drag yaws azimuth and clamps elevation', () => {
    const next = applyTurntableDrag(DEFAULT_ORBIT, 50, 10000)
    expect(next.azimuth).toBeGreaterThan(DEFAULT_ORBIT.azimuth)
    expect(next.elevation).toBeCloseTo(MAX_ELEVATION, 10)
    expect(next.roll).toBe(DEFAULT_ORBIT.roll)
  })

  it('trackball drag pitches freely past the horizon clamp', () => {
    const next = applyTrackballDrag({ azimuth: 0, elevation: 0, roll: 0 }, 0, 10000, 0.01)
    expect(next.elevation).toBeGreaterThan(MAX_ELEVATION)
  })

  it('auto-orbit advances azimuth over time', () => {
    const next = advanceAutoOrbit(DEFAULT_ORBIT, 1000, 0.3)
    expect(next.azimuth).toBeCloseTo(DEFAULT_ORBIT.azimuth + 0.3, 10)
    expect(next.elevation).toBe(DEFAULT_ORBIT.elevation)
  })
})
