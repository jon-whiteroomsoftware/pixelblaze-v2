import {
  clampGridDim,
  clampPixelCount,
  cubeSideForCount,
  MAX_GRID_AXIS,
  MAX_PIXEL_COUNT,
  posBounds2D,
  canvasSizeForBounds,
  projectPosInBounds,
  nearestNeighborSpacing2D,
  insetForSpacing,
  neighborPitch2DPx,
  type Bounds2D,
  DEFAULT_ORBIT,
  MAX_ELEVATION,
  clampElevation,
  orbitRotate,
  fit3DScale,
  FIT_3D_MARGIN,
  modelHalfExtent,
  lattice3DPitchPx,
  neighborPitchPx,
  nearestNeighborSpacing,
  point3DSize,
  diffusionGlow,
  DIFFUSION_GLOW_REACH,
  projectOrbit,
  orbitDepthToClipZ,
  depthCue,
  terminatorFade,
  TERMINATOR_WIDTH,
  applyOrbitDrag,
  advanceAutoOrbit,
  type OrbitCamera,
} from './camera'

describe('camera — freeze guard', () => {
  it('caps total pixel count at 65,536', () => {
    expect(MAX_PIXEL_COUNT).toBe(65536)
    expect(clampPixelCount(1_000_000)).toBe(65536)
    expect(clampPixelCount(100)).toBe(100)
  })

  it('derives a cube side from a pixel count (nearest cube root)', () => {
    expect(cubeSideForCount(512)).toBe(8)
    expect(cubeSideForCount(500)).toBe(8)
    expect(cubeSideForCount(1000)).toBe(10)
  })

  it('floors the cube side at 2 and caps it so side³ stays under the guard', () => {
    expect(cubeSideForCount(1)).toBe(2)
    expect(cubeSideForCount(0)).toBe(2)
    const maxSide = cubeSideForCount(1_000_000)
    expect(maxSide ** 3).toBeLessThanOrEqual(MAX_PIXEL_COUNT)
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

// Build the per-axis-normalized stock-plane pos for a square grid, matching
// `planePoint`'s `col/(cols-1)`, `row/(rows-1)` convention (row-major order).
function planePositions(cols: number, rows: number): [number, number][] {
  const out: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push([cols > 1 ? c / (cols - 1) : 0, rows > 1 ? r / (rows - 1) : 0])
    }
  }
  return out
}

// The legacy row-major cell-centred projection the pos path must reproduce.
function legacyProjectIndex(index: number, cols: number, rows: number): [number, number] {
  const col = index % cols
  const row = Math.floor(index / cols)
  return [((col + 0.5) / cols) * 2 - 1, 1 - ((row + 0.5) / rows) * 2]
}

describe('camera — pos-bounds 2D extent & sizing', () => {
  it('measures axis-aligned bounds, falling back to the unit box when empty', () => {
    expect(posBounds2D([[0.2, 0.1], [0.8, 0.9], [0.5, 0.4]])).toEqual({
      minX: 0.2, minY: 0.1, maxX: 0.8, maxY: 0.9,
    })
    expect(posBounds2D([])).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
  })

  it('sizes a square layout to a square canvas', () => {
    expect(canvasSizeForBounds(640, { minX: 0, minY: 0, maxX: 1, maxY: 1 })).toEqual({
      width: 640, height: 640,
    })
  })

  it('sizes a non-square bounds to its aspect (rangeY / rangeX)', () => {
    // 2:1 wide bounds → half-height canvas.
    expect(canvasSizeForBounds(640, { minX: 0, minY: 0, maxX: 1, maxY: 0.5 })).toEqual({
      width: 640, height: 320,
    })
  })

  it('falls back to a square canvas for a degenerate (zero-range) axis', () => {
    // A horizontal 1D line embedding (no y extent) must not collapse the height.
    expect(canvasSizeForBounds(640, { minX: 0, minY: 0.5, maxX: 1, maxY: 0.5 })).toEqual({
      width: 640, height: 640,
    })
  })

  it('reproduces the legacy cell-centred projection for the stock plane (parity)', () => {
    for (const cols of [2, 8, 9, 32]) {
      const rows = cols
      const positions = planePositions(cols, rows)
      const bounds = posBounds2D(positions)
      const spacing = nearestNeighborSpacing2D(positions)
      const inset = insetForSpacing(spacing)
      for (let i = 0; i < positions.length; i++) {
        const [x, y] = projectPosInBounds(positions[i], bounds, inset)
        const [lx, ly] = legacyProjectIndex(i, cols, rows)
        expect(x).toBeCloseTo(lx, 10)
        expect(y).toBeCloseTo(ly, 10)
      }
    }
  })

  it('centres a degenerate axis instead of dividing by zero', () => {
    const bounds: Bounds2D = { minX: 0, minY: 0.5, maxX: 1, maxY: 0.5 }
    const [, y] = projectPosInBounds([0.3, 0.5], bounds, { x: 0.1, y: 0 })
    expect(y).toBe(0) // clip-space centre
  })

  it('measures 2D nearest-neighbour spacing (regular grid → 1/(cols-1))', () => {
    expect(nearestNeighborSpacing2D(planePositions(9, 9))).toBeCloseTo(1 / 8, 10)
    expect(nearestNeighborSpacing2D([[0.5, 0.5]])).toBe(0)
  })

  it('ignores coincident origin-pile points (over-count custom replay)', () => {
    // A baked 9×9 grid rendered above its bakedCount piles surplus indices on the
    // origin; the pile must NOT collapse the measured pitch (else light size blooms
    // to fill the frame). The honest pitch stays the grid spacing among distinct pts.
    const grid = planePositions(9, 9)
    const piled = [...grid, ...Array.from({ length: 200 }, () => [0, 0] as [number, number])]
    expect(nearestNeighborSpacing2D(piled)).toBeCloseTo(1 / 8, 10)
  })

  it('derives an on-screen px pitch from the measured spacing (square plane ≈ width/cols)', () => {
    const cols = 32
    const positions = planePositions(cols, cols)
    const bounds = posBounds2D(positions)
    const spacing = nearestNeighborSpacing2D(positions)
    const inset = insetForSpacing(spacing)
    const { width, height } = canvasSizeForBounds(640, bounds)
    const pitch = neighborPitch2DPx(width, height, bounds, spacing, inset)
    expect(pitch).toBeCloseTo(640 / cols, 6) // span = cols/(cols-1), spacing = 1/(cols-1)
  })

  it('never produces a sub-pixel pitch, even for a lone point', () => {
    const bounds = posBounds2D([[0.5, 0.5]])
    expect(neighborPitch2DPx(640, 640, bounds, 0, { x: 0, y: 0 })).toBeGreaterThanOrEqual(1)
  })

  describe('modelHalfExtent (bounding-sphere fit)', () => {
    it('measures the farthest point from the rotation centre', () => {
      // A full cube reaches its corner: half the space diagonal.
      const corners: [number, number, number][] = [
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 1],
      ]
      expect(modelHalfExtent(corners)).toBeCloseTo(0.5 * Math.sqrt(3))
    })

    it('shrinks for a thinner model, so the fit zooms it in further', () => {
      const fat: [number, number, number][] = [
        [0.1, 0.5, 0.5],
        [0.9, 0.5, 0.5],
      ]
      const thin: [number, number, number][] = [
        [0.3, 0.5, 0.5],
        [0.7, 0.5, 0.5],
      ]
      const fatExtent = modelHalfExtent(fat)
      const thinExtent = modelHalfExtent(thin)
      expect(thinExtent).toBeLessThan(fatExtent)
      // Smaller extent → larger fit scale (zoomed in).
      expect(fit3DScale(FIT_3D_MARGIN, thinExtent)).toBeGreaterThan(
        fit3DScale(FIT_3D_MARGIN, fatExtent),
      )
    })

    it('falls back to the unit-cube diagonal for an empty set', () => {
      expect(modelHalfExtent([])).toBeCloseTo(0.5 * Math.sqrt(3))
    })
  })
})

describe('camera — 3D light size', () => {
  it('lattice pitch is the projected screen-space gap between adjacent points', () => {
    // 8-per-axis lattice, 400px square canvas. Normalized pitch 1/(side-1) is
    // scaled into clip space and converted to px (clip span 2 ↔ canvasPx).
    const expected = (fit3DScale() / 7 / 2) * 400
    expect(lattice3DPitchPx(400, 8)).toBeCloseTo(expected, 6)
  })

  it('a single-cell axis has no pitch, so falls back to the full projected extent', () => {
    expect(lattice3DPitchPx(400, 1)).toBeCloseTo((fit3DScale() / 2) * 400, 6)
  })

  it('neighborPitchPx matches the lattice pitch for a regular lattice spacing', () => {
    // A side-8 cubic lattice has axis spacing 1/(8-1); the measured-spacing pitch
    // must agree with the side-based lattice pitch (same geometry).
    expect(neighborPitchPx(400, 1 / 7)).toBeCloseTo(lattice3DPitchPx(400, 8), 6)
  })

  it('neighborPitchPx falls back to the full extent for a zero spacing', () => {
    expect(neighborPitchPx(400, 0)).toBeCloseTo((fit3DScale() / 2) * 400, 6)
  })

  it('point3DSize is the measured neighbour pitch times the light-size fraction', () => {
    const pitch = neighborPitchPx(400, 1 / 7)
    expect(point3DSize(400, 1 / 7, 0.5)).toBeCloseTo(pitch * 0.5, 6)
    // Larger light size → larger orb; "almost touching" near 0.95.
    expect(point3DSize(400, 1 / 7, 0.95)).toBeGreaterThan(point3DSize(400, 1 / 7, 0.5))
  })

  it('never produces a sub-pixel diameter', () => {
    expect(point3DSize(10, 1 / 255, 0.15)).toBe(1)
  })

  describe('nearestNeighborSpacing', () => {
    it('returns 0 for fewer than two points', () => {
      expect(nearestNeighborSpacing([])).toBe(0)
      expect(nearestNeighborSpacing([[0.5, 0.5, 0.5]])).toBe(0)
    })

    it('measures the axis pitch of a regular cubic lattice', () => {
      const side = 4
      const pts: [number, number, number][] = []
      for (let z = 0; z < side; z++)
        for (let y = 0; y < side; y++)
          for (let x = 0; x < side; x++)
            pts.push([x / (side - 1), y / (side - 1), z / (side - 1)])
      expect(nearestNeighborSpacing(pts)).toBeCloseTo(1 / (side - 1), 6)
    })

    it('measures the true surface gap of a sphere shell, not the cube-root estimate', () => {
      // A Fibonacci shell's neighbour gap ~ sqrt(area/N), far below the solid-
      // lattice 1/(cbrt(N)-1) the old sizing assumed — the #63 ballooning cause.
      const n = 500
      const pts: [number, number, number][] = []
      const phi = Math.PI * (3 - Math.sqrt(5))
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2
        const r = Math.sqrt(1 - y * y)
        const t = phi * i
        pts.push([(Math.cos(t) * r + 1) / 2, (y + 1) / 2, (Math.sin(t) * r + 1) / 2])
      }
      const measured = nearestNeighborSpacing(pts)
      const cubeRootEstimate = 1 / (Math.cbrt(n) - 1)
      expect(measured).toBeGreaterThan(0)
      expect(measured).toBeLessThan(cubeRootEstimate * 0.75)
    })
  })
})

describe('camera — per-source diffusion glow', () => {
  it('at diffusion 0 is bit-for-bit the solid core disc (quad == core, full peak, no tail)', () => {
    const g = diffusionGlow(0, 20, 25)
    expect(g.quadDiameterPx).toBe(20)
    expect(g.coreFrac).toBe(1)
    expect(g.peak).toBe(1)
  })

  it('grows the quad by the glow reach so the tail clears the source centre', () => {
    const pitch = 25
    const core = 20
    const g = diffusionGlow(1, core, pitch)
    // The tail reaches DIFFUSION_GLOW_REACH pitches past the source centre each side.
    expect(g.quadDiameterPx).toBeCloseTo(core + 2 * pitch * DIFFUSION_GLOW_REACH, 6)
  })

  it('dissolves the solid core as diffusion rises (coreFrac 1 → 0)', () => {
    const mid = diffusionGlow(0.5, 20, 25)
    const full = diffusionGlow(1, 20, 25)
    // Mid-diffusion still keeps a (shrunken) solid core; full diffusion has none.
    expect(mid.coreFrac).toBeGreaterThan(0)
    expect(mid.coreFrac).toBeLessThan(1)
    expect(full.coreFrac).toBeCloseTo(0, 6)
  })

  it('widens the footprint monotonically with diffusion', () => {
    const half = diffusionGlow(0.5, 20, 25)
    const full = diffusionGlow(1, 20, 25)
    expect(half.quadDiameterPx).toBeLessThan(full.quadDiameterPx)
  })

  it('normalises peak down as neighbours overlap, never above 1 (pins the brightest point)', () => {
    // Tight pitch ⇒ heavy overlap ⇒ peak well below 1; the brightest point holds
    // steady rather than blowing out.
    const full = diffusionGlow(1, 20, 25)
    expect(full.peak).toBeGreaterThan(0)
    expect(full.peak).toBeLessThan(1)
    // Sparser pitch (less overlap) keeps more of the peak than a dense one.
    const dense = diffusionGlow(1, 20, 25)
    const sparse = diffusionGlow(1, 20, 60)
    expect(sparse.peak).toBeGreaterThan(dense.peak)
  })

  it('degenerates to the solid core when pitch or core is zero', () => {
    expect(diffusionGlow(1, 20, 0)).toMatchObject({ quadDiameterPx: 20, coreFrac: 1, peak: 1 })
    expect(diffusionGlow(1, 0, 25).coreFrac).toBe(1)
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

describe('camera — orbit depth to clip z (opaque 3D)', () => {
  const halfDiag = 0.5 * Math.sqrt(3)

  it('maps the nearest point (largest depth) to the front of the frustum', () => {
    // projectOrbit returns larger-z = nearer; the depth test keeps the smallest
    // z, so the nearest point must land at the front clip plane (-1).
    expect(orbitDepthToClipZ(halfDiag)).toBeCloseTo(-1, 9)
  })

  it('maps the farthest point (most negative depth) to the back of the frustum', () => {
    expect(orbitDepthToClipZ(-halfDiag)).toBeCloseTo(1, 9)
  })

  it('puts the model centre at the mid-plane', () => {
    expect(orbitDepthToClipZ(0)).toBeCloseTo(0, 9)
  })

  it('clamps a beyond-worst-case depth into clip space', () => {
    expect(orbitDepthToClipZ(2 * halfDiag)).toBe(-1)
    expect(orbitDepthToClipZ(-2 * halfDiag)).toBe(1)
  })
})

describe('camera — depth cueing', () => {
  it('nearer dots are brighter than farther ones, with size left uncued (#63)', () => {
    const half = 0.5 * Math.sqrt(3)
    const near = depthCue(half)
    const far = depthCue(-half)
    expect(near.brightnessMul).toBeGreaterThan(far.brightnessMul)
    // Size is flat by default — no depth-driven gradient (keystone/pack fix).
    expect(near.sizeMul).toBe(1)
    expect(far.sizeMul).toBe(1)
    expect(near.brightnessMul).toBeCloseTo(1, 10)
  })

  it('still supports an explicit size gradient when asked', () => {
    const half = 0.5 * Math.sqrt(3)
    const near = depthCue(half, { nearSize: 1, farSize: 0.5 })
    const far = depthCue(-half, { nearSize: 1, farSize: 0.5 })
    expect(near.sizeMul).toBeGreaterThan(far.sizeMul)
  })

  it('clamps out-of-range depth', () => {
    expect(depthCue(99).brightnessMul).toBeCloseTo(depthCue(10).brightnessMul, 10)
  })
})

describe('camera — orbit interaction', () => {
  it('orbit drag moves both axes at once but clamps elevation to the horizon', () => {
    const next = applyOrbitDrag({ azimuth: 0, elevation: 0, roll: 0 }, 50, 10000, 0.01)
    expect(next.azimuth).toBeGreaterThan(0)
    expect(next.elevation).toBeCloseTo(MAX_ELEVATION, 10)
    expect(next.roll).toBe(0)
  })

  it('auto-orbit advances azimuth over time', () => {
    const next = advanceAutoOrbit(DEFAULT_ORBIT, 1000, 0.3)
    expect(next.azimuth).toBeCloseTo(DEFAULT_ORBIT.azimuth + 0.3, 10)
    expect(next.elevation).toBe(DEFAULT_ORBIT.elevation)
  })
})

describe('terminatorFade (solidity back-face fade)', () => {
  it('is 1 everywhere at solidity 0 — bit-identical to the see-through draw', () => {
    for (const facing of [-1, -0.5, -0.1, 0, 0.1, 0.5, 1]) {
      expect(terminatorFade(facing, 0)).toBe(1)
    }
  })

  it('never alters a front-facing point at any slider value', () => {
    for (const solidity of [0, 0.3, 0.7, 1]) {
      for (const facing of [0, 0.01, 0.3, 1]) {
        expect(terminatorFade(facing, solidity)).toBe(1)
      }
    }
  })

  it('fades a fully back-facing point to zero at solidity 1', () => {
    // beyond the terminator band, the back reaches the floor 1 − solidity = 0
    expect(terminatorFade(-TERMINATOR_WIDTH, 1)).toBeCloseTo(0)
    expect(terminatorFade(-1, 1)).toBeCloseTo(0)
  })

  it('floors the back at 1 − solidity (frosted), independent of facing depth', () => {
    expect(terminatorFade(-TERMINATOR_WIDTH, 0.3)).toBeCloseTo(0.7)
    expect(terminatorFade(-1, 0.3)).toBeCloseTo(0.7)
    expect(terminatorFade(-TERMINATOR_WIDTH, 0.7)).toBeCloseTo(0.3)
  })

  it('eases smoothly across the terminator (monotone 1 → floor)', () => {
    const a = terminatorFade(-0.1, 1)
    const b = terminatorFade(-0.25, 1)
    const c = terminatorFade(-0.4, 1)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
    expect(a).toBeLessThanOrEqual(1)
    expect(c).toBeGreaterThanOrEqual(0)
  })

  it('clamps an out-of-range solidity to [0,1]', () => {
    expect(terminatorFade(-1, 2)).toBeCloseTo(0)
    expect(terminatorFade(-1, -1)).toBe(1)
  })
})
