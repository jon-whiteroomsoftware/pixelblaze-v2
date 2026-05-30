import { describe, it, expect } from 'vitest'
import { createPlaneMap } from './plane'

describe('createPlaneMap', () => {
  it('produces exactly pixelCount points', () => {
    const map = createPlaneMap({ rows: 4, cols: 3 })
    expect(map.resolve(12)).toHaveLength(12)
  })

  it('is row-major: index = row*cols + col', () => {
    const map = createPlaneMap({ rows: 2, cols: 3 })
    const pts = map.resolve(6)
    // cols=3 => x normalized over {0, .5, 1}; rows=2 => y over {0, 1}
    expect(pts[0].sample).toEqual([0, 0])
    expect(pts[2].sample).toEqual([1, 0]) // last col of row 0
    expect(pts[3].sample).toEqual([0, 1]) // first col of row 1
    expect(pts[5].sample).toEqual([1, 1])
  })

  it('normalizes per-axis into 0..1 (x = col/(cols-1), y = row/(rows-1))', () => {
    const map = createPlaneMap({ rows: 3, cols: 5 })
    const pts = map.resolve(15)
    expect(pts[7].sample).toEqual([2 / 4, 1 / 2]) // col 2, row 1
  })

  it('maps a single-cell axis to 0 (no divide-by-zero)', () => {
    const map = createPlaneMap({ rows: 1, cols: 1 })
    expect(map.resolve(1)[0].sample).toEqual([0, 0])
  })

  it('coincides sample and map-intrinsic pos for the grid', () => {
    const map = createPlaneMap({ rows: 4, cols: 4 })
    for (const p of map.resolve(16)) {
      expect(p.pos).toEqual(p.sample)
    }
  })

  it('matches the legacy grid loop coordinates (x = col/(cols-1))', () => {
    const rows = 8, cols = 9
    const pts = createPlaneMap({ rows, cols }).resolve(rows * cols)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = pts[row * cols + col]
        expect(p.sample).toEqual([col / (cols - 1), row / (rows - 1)])
      }
    }
  })

  it('is a 2D builtin map', () => {
    const map = createPlaneMap({ rows: 2, cols: 2 })
    expect(map.dim).toBe(2)
    expect(map.builtin).toBe(true)
  })
})
