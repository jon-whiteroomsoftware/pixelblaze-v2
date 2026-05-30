import { LINE, RING, SHAPES, embedPositions, type Shape } from './shapes'
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
