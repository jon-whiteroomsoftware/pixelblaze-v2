import { normalizeAspect, normalizeFill, applyNormalizeMode } from './normalize'

describe('applyNormalizeMode', () => {
  const pts = [
    { sample: [0, 0], pos: [0, 0] as [number, number] },
    { sample: [0.5, 0.25], pos: [0.5, 0.25] as [number, number] },
    { sample: [1, 0.5], pos: [1, 0.5] as [number, number] },
  ]

  it('passes Contain points through unchanged (same reference)', () => {
    expect(applyNormalizeMode(pts, 'contain')).toBe(pts)
  })

  it('stretches only sample under Fill; pos keeps the map’s physical aspect', () => {
    // The map dictates the physical layout (project axiom): Fill must NOT move the
    // pixels or change the canvas aspect. It only stretches the COORDINATES the
    // pattern samples. So `pos` stays the aspect-preserving Contain coords (a 2:1
    // map stays 2:1) while `sample` fills the unit square per-axis.
    const out = applyNormalizeMode(pts, 'fill')
    expect(out.map((p) => p.pos)).toEqual([[0, 0], [0.5, 0.25], [1, 0.5]])
    expect(out.map((p) => p.sample)).toEqual([[0, 0], [0.5, 0.5], [1, 1]])
  })

  it('handles empty input', () => {
    expect(applyNormalizeMode([], 'fill')).toEqual([])
  })
})

describe('normalizeFill', () => {
  it('stretches each axis independently to [0,1] (per-axis Fill)', () => {
    // x:0..4, y:0..2 → both fill [0,1] regardless of the 2:1 aspect.
    expect(normalizeFill([[0, 0], [2, 1], [4, 2]])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ])
  })

  it('matches Fill-from-raw when applied to Contain output (idempotent post-pass)', () => {
    const raw = [[0, 0], [2, 1], [4, 2]]
    expect(normalizeFill(normalizeAspect(raw))).toEqual(normalizeFill(raw))
  })

  it('collapses a degenerate (constant) axis to 0', () => {
    expect(normalizeFill([[0, 7], [2, 7], [4, 7]])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
    ])
  })

  it('returns empty for empty input and does not mutate the input', () => {
    expect(normalizeFill([])).toEqual([])
    const raw = [[1, 2], [3, 4]]
    normalizeFill(raw)
    expect(raw).toEqual([[1, 2], [3, 4]])
  })
})

describe('normalizeAspect', () => {
  it('anchors the longest axis to [0,1] and scales shorter axes proportionally', () => {
    // x spans 0..4 (range 4, longest), y spans 0..2 (range 2) → y maps to 0..0.5,
    // preserving the 2:1 aspect instead of stretching both axes to fill [0,1].
    expect(normalizeAspect([[0, 0], [2, 1], [4, 2]])).toEqual([
      [0, 0],
      [0.5, 0.25],
      [1, 0.5],
    ])
  })

  it('keeps a square layout square (equal ranges → both fill [0,1])', () => {
    expect(normalizeAspect([[0, 0], [2, 2], [4, 4]])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ])
  })

  it('reproduces i/(cols-1) for a single row (plane byte-stability)', () => {
    const cols = 5
    const raw = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]
    const out = normalizeAspect(raw)
    for (let col = 0; col < cols; col++) {
      // x is the longest (and only non-degenerate) axis → fills [0,1] as before.
      expect(out[col][0]).toBe(col / (cols - 1))
      expect(out[col][1]).toBe(0)
    }
  })

  it('preserves aspect across 3 axes (longest axis anchors all)', () => {
    // x:0..4, y:0..2, z:0..1 → divide all by 4.
    expect(normalizeAspect([[0, 0, 0], [4, 2, 1]])).toEqual([
      [0, 0, 0],
      [1, 0.5, 0.25],
    ])
  })

  it('collapses a degenerate (constant) short axis to 0', () => {
    expect(normalizeAspect([[0, 7], [2, 7], [4, 7]])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
    ])
  })

  it('collapses a fully coincident input to the origin', () => {
    expect(normalizeAspect([[3, 9, 2]])).toEqual([[0, 0, 0]])
    expect(normalizeAspect([[5, 5], [5, 5]])).toEqual([[0, 0], [0, 0]])
  })

  it('returns empty for empty input and does not mutate the input', () => {
    expect(normalizeAspect([])).toEqual([])
    const raw = [[1, 2], [3, 4]]
    normalizeAspect(raw)
    expect(raw).toEqual([[1, 2], [3, 4]])
  })
})
