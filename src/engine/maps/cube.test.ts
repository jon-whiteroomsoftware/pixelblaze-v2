import { cubePoint, cubePixelCount, createCubeMap } from './cube'

describe('cube map', () => {
  it('counts side³ pixels', () => {
    expect(cubePixelCount(8)).toBe(512)
    expect(cubePixelCount(1)).toBe(1)
  })

  it('places the first pixel at a corner and the last at the opposite corner', () => {
    const first = cubePoint(0, { side: 4 })
    const last = cubePoint(63, { side: 4 })
    expect(first.pos).toEqual([0, 0, 0])
    expect(last.pos).toEqual([1, 1, 1])
  })

  it('orders x-fastest, then y, then z', () => {
    // side 4: index 1 steps x, index 4 steps y, index 16 steps z.
    expect(cubePoint(1, { side: 4 }).pos).toEqual([1 / 3, 0, 0])
    expect(cubePoint(4, { side: 4 }).pos).toEqual([0, 1 / 3, 0])
    expect(cubePoint(16, { side: 4 }).pos).toEqual([0, 0, 1 / 3])
  })

  it('sample (render3D coords) coincides with the drawn pos', () => {
    const p = cubePoint(21, { side: 4 })
    expect(p.sample).toEqual(p.pos)
    expect(p.sample.length).toBe(3)
  })

  it('resolve emits one 3-arity sample per index', () => {
    const map = createCubeMap({ side: 3 })
    expect(map.dim).toBe(3)
    const pts = map.resolve(cubePixelCount(3))
    expect(pts).toHaveLength(27)
    expect(pts.every((p) => p.sample.length === 3)).toBe(true)
  })

  it('centres a degenerate single-cell axis at 0.5', () => {
    expect(cubePoint(0, { side: 1 }).pos).toEqual([0.5, 0.5, 0.5])
  })
})
