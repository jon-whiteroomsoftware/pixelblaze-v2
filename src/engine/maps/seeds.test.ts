import { seedMapRecords } from './seeds'
import { createCustomMap } from './custom'

describe('seedMapRecords', () => {
  const seeds = seedMapRecords(123)

  it('seeds both 3D point clouds and an irregular 2D arrangement', () => {
    const dims = seeds.map((s) => s.dim).sort()
    expect(dims).toEqual([2, 3, 3])
  })

  it('stamps every seed as a custom-generator row with a baked array', () => {
    for (const s of seeds) {
      expect(s.generator).toBe('custom')
      expect(s.points && s.points.length).toBeGreaterThan(0)
      expect(s.updatedAt).toBe(123)
    }
  })

  it('produces stable ids that build valid custom maps', () => {
    for (const s of seeds) {
      const m = createCustomMap(s.points ?? [], { id: s.id, name: s.name })
      expect(m.dim).toBe(s.dim)
    }
  })

  it('bakes normalized [0,1] coordinates', () => {
    for (const s of seeds) {
      for (const p of s.points ?? []) {
        for (const c of p) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
