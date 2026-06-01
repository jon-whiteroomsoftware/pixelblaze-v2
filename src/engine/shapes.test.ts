import {
  LINE,
  RING,
  POLE,
  SHAPES,
  embedPositions,
  poleMaxCols,
  defaultPoleCols,
  clampPoleCols,
  polePositions,
  poleNormal,
  poleNormals,
  type Shape,
} from './shapes'
import type { MapPoint } from './maps'

describe('shapes (viewport 1D embeddings)', () => {
  describe('line', () => {
    it('spreads the index sequence across the horizontal centre', () => {
      expect(LINE.embed(0, 5)).toEqual([0, 0.5])
      expect(LINE.embed(2, 5)).toEqual([0.5, 0.5])
      expect(LINE.embed(4, 5)).toEqual([1, 0.5])
    })

    it('centres a single pixel (no divide-by-zero)', () => {
      expect(LINE.embed(0, 1)).toEqual([0.5, 0.5])
    })
  })

  describe('ring', () => {
    it('wraps the index sequence once around a centred unit circle', () => {
      const [x0, y0] = RING.embed(0, 4)
      expect(x0).toBeCloseTo(1)
      expect(y0).toBeCloseTo(0.5)

      const [x1, y1] = RING.embed(1, 4)
      expect(x1).toBeCloseTo(0.5)
      expect(y1).toBeCloseTo(1)

      const [x2, y2] = RING.embed(2, 4)
      expect(x2).toBeCloseTo(0)
      expect(y2).toBeCloseTo(0.5)
    })

    it('leaves a one-step gap at the seam so the chase spins', () => {
      // index/pixelCount, not /(pixelCount-1): the last dot is short of the first.
      const first = RING.embed(0, 8)
      const last = RING.embed(7, 8)
      expect(last).not.toEqual(first)
    })
  })

  it('exposes a shape registry keyed by id', () => {
    expect(SHAPES.line).toBe(LINE)
    expect(SHAPES.ring).toBe(RING)
    expect(SHAPES.pole).toBe(POLE)
  })

  describe('pole', () => {
    it('is a 3D-display shape (gets the orbit camera)', () => {
      expect(POLE.displayDim).toBe(3)
    })

    it('column bounds keep the pole taller than wide', () => {
      const n = 200
      const max = poleMaxCols(n)
      // At the upper bound the pole is at most square: cols < pi * (rows - 1).
      const rows = Math.ceil(n / max)
      const diameter = max / (Math.PI * (rows - 1))
      expect(diameter).toBeLessThanOrEqual(1.0001)
      // The default sits strictly inside the taller-than-wide regime.
      const def = defaultPoleCols(n)
      expect(def).toBeGreaterThanOrEqual(2)
      expect(def).toBeLessThanOrEqual(max)
      const defRows = Math.ceil(n / def)
      const defDiameter = def / (Math.PI * (defRows - 1))
      expect(defDiameter).toBeLessThan(1)
    })

    it('clamps a requested column count into the valid range', () => {
      const n = 200
      const max = poleMaxCols(n)
      expect(clampPoleCols(n, 0)).toBe(2)
      expect(clampPoleCols(n, 1)).toBe(2)
      expect(clampPoleCols(n, max + 50)).toBe(max)
      expect(clampPoleCols(n, 5)).toBe(5)
    })

    it('wraps the strip onto a centred cylinder with square cells', () => {
      const n = 200
      const cols = 8
      const pos = polePositions(n, cols)
      expect(pos).toHaveLength(n)
      const rows = Math.ceil(n / cols)
      const rho = cols / (2 * Math.PI * (rows - 1))
      const dist = (a: number[], b: number[]) =>
        Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      // One wrap up (index cols): col 0 again, row 1 → same angle, one pitch up
      // the pole's long axis. The 3D gap equals the vertical pitch, which equals
      // the horizontal arc pitch (square cell).
      const arcPitch = (2 * Math.PI * rho) / cols
      const vPitch = 1 / (rows - 1)
      expect(vPitch).toBeCloseTo(arcPitch)
      expect(dist(pos[0], pos[cols])).toBeCloseTo(vPitch)
    })

    it('lies along the cube body diagonal (askew), centred in the unit cube', () => {
      const n = 200
      const pos = polePositions(n, 8)
      const diag = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]
      // Project each point onto the diagonal (relative to the centre): the pole's
      // length spans 1 along it, symmetric about 0 — i.e. it runs corner-to-corner.
      const along = pos.map((p) =>
        (p[0] - 0.5) * diag[0] + (p[1] - 0.5) * diag[1] + (p[2] - 0.5) * diag[2],
      )
      expect(Math.min(...along)).toBeCloseTo(-0.5)
      expect(Math.max(...along)).toBeCloseTo(0.5)
      // Stays inside the unit cube on every axis.
      for (const c of pos.flat()) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    })

    it('leaves a one-step seam gap around the wrap (no doubled pixel)', () => {
      const pos = polePositions(64, 8)
      // col 0 and the last col of the same row are one step short of overlapping.
      expect(pos[0][0]).not.toBeCloseTo(pos[7][0])
    })

    it('is solid-eligible (Line and Ring are not)', () => {
      expect(POLE.solidEligible).toBe(true)
      expect(LINE.solidEligible).toBe(false)
      expect(RING.solidEligible).toBe(false)
    })

    it('emits outward unit normals radial to the body-diagonal axis', () => {
      const cols = 8
      const n = poleNormals(64, cols)
      const pos = polePositions(64, cols)
      const W: [number, number, number] = [
        1 / Math.sqrt(3),
        1 / Math.sqrt(3),
        1 / Math.sqrt(3),
      ]
      for (let i = 0; i < n.length; i++) {
        // unit length
        expect(Math.hypot(...n[i])).toBeCloseTo(1)
        // perpendicular to the pole's long axis (purely radial, no axial part)
        const axial = n[i][0] * W[0] + n[i][1] * W[1] + n[i][2] * W[2]
        expect(axial).toBeCloseTo(0)
        // points outward: aligned with the point's radial offset from the axis
        const r: [number, number, number] = [pos[i][0] - 0.5, pos[i][1] - 0.5, pos[i][2] - 0.5]
        const rAxial = r[0] * W[0] + r[1] * W[1] + r[2] * W[2]
        const radial = [r[0] - rAxial * W[0], r[1] - rAxial * W[1], r[2] - rAxial * W[2]]
        const rlen = Math.hypot(...radial)
        if (rlen > 1e-9) {
          const dot = (n[i][0] * radial[0] + n[i][1] * radial[1] + n[i][2] * radial[2]) / rlen
          expect(dot).toBeCloseTo(1)
        }
      }
    })

    it('repeats the normal each wrap (depends on column, not row)', () => {
      const cols = 8
      expect(poleNormal(0, 64, cols)).toEqual(poleNormal(cols, 64, cols))
    })
  })

  describe('embedPositions', () => {
    it('resolves one display position per index', () => {
      const path = embedPositions(LINE, 3)
      expect(path).toEqual([
        [0, 0.5],
        [0.5, 0.5],
        [1, 0.5],
      ])
    })

    it('produces pos only — a 1D pattern\'s empty sample is left untouched', () => {
      // A 1D layout carries an empty `sample`; a shape supplies `pos` without
      // ever reading or writing `sample`.
      const points: MapPoint[] = [{ sample: [] }, { sample: [] }, { sample: [] }]
      const shape: Shape = RING
      const path = embedPositions(shape, points.length)
      expect(path).toHaveLength(points.length)
      expect(points.every((p) => p.sample.length === 0)).toBe(true)
    })
  })
})
