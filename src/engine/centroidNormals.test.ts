import { centroid, centroidNormals, type Vec3 } from './centroidNormals'

describe('centroid', () => {
  it('is the origin for an empty cloud', () => {
    expect(centroid([])).toEqual([0, 0, 0])
  })

  it('averages the positions', () => {
    const c = centroid([
      [0, 0, 0],
      [2, 4, 6],
    ])
    expect(c).toEqual([1, 2, 3])
  })
})

describe('centroidNormals', () => {
  // A unit sphere centred at (0.5,0.5,0.5): every point's outward normal is the
  // radial direction from the centre, so it equals the (unit) offset from centre.
  it('points radially outward from the centroid for a convex shell', () => {
    // A symmetric ±-axis set so the centroid lands exactly at (0.5,0.5,0.5).
    const r = 0.5
    const positions: Vec3[] = [
      [0.5 + r, 0.5, 0.5],
      [0.5 - r, 0.5, 0.5],
      [0.5, 0.5 + r, 0.5],
      [0.5, 0.5 - r, 0.5],
      [0.5, 0.5, 0.5 + r],
      [0.5, 0.5, 0.5 - r],
    ]
    const normals = centroidNormals(positions)
    expect(normals[0]).toEqual([1, 0, 0])
    expect(normals[1]).toEqual([-1, 0, 0])
    expect(normals[2]).toEqual([0, 1, 0])
    expect(normals[4]).toEqual([0, 0, 1])
  })

  it('returns unit-length normals', () => {
    const normals = centroidNormals([
      [1, 2, 3],
      [-4, 5, -6],
      [0.1, 0.2, 0.9],
    ])
    for (const [x, y, z] of normals) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(1)
    }
  })

  it('falls back to facing the camera for a point at the centroid', () => {
    // Two coincident points → centroid sits on them → no radial direction.
    expect(centroidNormals([[0.5, 0.5, 0.5], [0.5, 0.5, 0.5]])).toEqual([
      [0, 0, 1],
      [0, 0, 1],
    ])
  })
})
