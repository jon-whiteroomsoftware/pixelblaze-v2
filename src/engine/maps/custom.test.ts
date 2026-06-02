import { createCustomMap, inferDim } from './custom'

describe('inferDim', () => {
  it('infers 2D from [x,y] arity', () => {
    expect(inferDim([[0, 0], [1, 1]])).toBe(2)
  })

  it('infers 3D from [x,y,z] arity', () => {
    expect(inferDim([[0, 0, 0], [1, 1, 1]])).toBe(3)
  })

  it('rejects mixed arity', () => {
    expect(() => inferDim([[0, 0], [1, 1, 1]])).toThrow(/mixed coordinate arity/)
  })

  it('rejects an empty point list', () => {
    expect(() => inferDim([])).toThrow(/at least one point/)
  })

  it('rejects a non-2/3 arity', () => {
    expect(() => inferDim([[0]])).toThrow(/2D .* or 3D/)
  })
})

describe('createCustomMap', () => {
  it('infers dim and bakedCount from the coordinate array', () => {
    const m = createCustomMap([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], { id: 'r', name: 'Ring' })
    expect(m.dim).toBe(2)
    expect(m.bakedCount).toBe(3)
    expect(m.builtin).toBe(false)
  })

  it('replays the baked array index-aligned when count matches', () => {
    const pts = [[0.1, 0.2], [0.3, 0.4]]
    const m = createCustomMap(pts, { id: 'r', name: 'Ring' })
    const out = m.resolve(2)
    expect(out.map((p) => p.pos)).toEqual(pts)
    expect(out.map((p) => p.sample)).toEqual(pts)
  })

  it('falls back to origin for indices past the baked end (over-count drift)', () => {
    const m = createCustomMap([[0.1, 0.2]], { id: 'r', name: 'Ring' })
    const out = m.resolve(3)
    expect(out).toHaveLength(3)
    expect(out[0].pos).toEqual([0.1, 0.2])
    expect(out[1].pos).toEqual([0, 0])
    expect(out[2].pos).toEqual([0, 0])
  })

  it('uses a 3D origin for over-count 3D drift', () => {
    const m = createCustomMap([[0.1, 0.2, 0.3]], { id: 'h', name: 'Helix' })
    const out = m.resolve(2)
    expect(out[1].pos).toEqual([0, 0, 0])
    expect(out[1].sample).toEqual([0, 0, 0])
  })

  it('leaves surplus baked entries unvisited when count is below the baked length', () => {
    const m = createCustomMap([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]], { id: 'r', name: 'Ring' })
    const out = m.resolve(2)
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.pos)).toEqual([[0.1, 0.2], [0.3, 0.4]])
  })

  it('does not regenerate — replay is a pure read of the frozen array', () => {
    const pts = [[0.1, 0.2]]
    const m = createCustomMap(pts, { id: 'r', name: 'Ring' })
    // Mutating the source after construction must not leak into resolve.
    pts[0][0] = 0.9
    expect(m.resolve(1)[0].pos).toEqual([0.1, 0.2])
  })

  it('replays its baked grid dims count-independently, null when none recorded', () => {
    const lattice = createCustomMap([[0, 0], [1, 0], [0, 1], [1, 1]], {
      id: 'g',
      name: 'Grid',
      gridDims: { cols: 2, rows: 2 },
    })
    // The recorded dims ride along regardless of the modeled count.
    expect(lattice.gridDims(4)).toEqual({ cols: 2, rows: 2 })
    expect(lattice.gridDims(999)).toEqual({ cols: 2, rows: 2 })
    // An irregular cloud baked no dims, so it exposes no grid.
    const cloud = createCustomMap([[0.1, 0.2], [0.3, 0.4]], { id: 'c', name: 'Cloud' })
    expect(cloud.gridDims(2)).toBeNull()
  })
})
