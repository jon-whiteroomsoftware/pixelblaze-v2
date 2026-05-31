import { normalizePerAxis } from './normalize'

describe('normalizePerAxis', () => {
  it('stretches each axis independently to [0,1] by its own min/max', () => {
    // x spans 0..4, y spans 10..20 → each maps to 0..1 on its own range.
    expect(normalizePerAxis([[0, 10], [2, 15], [4, 20]])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ])
  })

  it('reproduces i/(cols-1) for integer lattice indices (plane byte-stability)', () => {
    const cols = 5
    const raw = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]
    const out = normalizePerAxis(raw)
    for (let col = 0; col < cols; col++) {
      expect(out[col][0]).toBe(col / (cols - 1))
    }
  })

  it('maps [-1,1] symmetric ranges onto [0,1]', () => {
    expect(normalizePerAxis([[-1, -1], [0, 0], [1, 1]])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ])
  })

  it('collapses a degenerate (constant) axis to 0', () => {
    // y is constant → 0; x still normalizes.
    expect(normalizePerAxis([[0, 7], [1, 7], [2, 7]])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
    ])
  })

  it('handles a single point (every axis degenerate → 0)', () => {
    expect(normalizePerAxis([[3, 9, 2]])).toEqual([[0, 0, 0]])
  })

  it('returns empty for empty input and does not mutate the input', () => {
    expect(normalizePerAxis([])).toEqual([])
    const raw = [[1, 2], [3, 4]]
    normalizePerAxis(raw)
    expect(raw).toEqual([[1, 2], [3, 4]])
  })
})
