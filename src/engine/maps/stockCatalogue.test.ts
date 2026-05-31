import { SOURCE_STOCK_MAPS, STOCK_MAP_SPECS, SEED_MAP_IDS, stockMapSpec } from './stockCatalogue'
import { squarePlaneDims } from './plane'

function mapById(id: string) {
  const m = SOURCE_STOCK_MAPS.find((m) => m.id === id)
  if (!m) throw new Error(`no stock map ${id}`)
  return m
}

describe('stock catalogue', () => {
  it('pairs each stock id with metadata and a non-empty raw source', () => {
    expect(STOCK_MAP_SPECS.map((s) => s.id)).toEqual([
      'plane',
      'cube',
      'seed-helix-3d',
      'seed-sphere-3d',
      'seed-ring-2d',
    ])
    for (const s of STOCK_MAP_SPECS) {
      expect(s.source).toMatch(/function\s*\(/)
    }
  })

  it('excludes the drape cylinder (no faithful source — ADR-0008 exception)', () => {
    expect(stockMapSpec('cylinder')).toBeUndefined()
  })

  it('builds live builtin maps of the declared dimensionality', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.builtin).toBe(true)
      expect(m.bakedCount).toBeUndefined()
    }
    expect(mapById('plane').dim).toBe(2)
    expect(mapById('cube').dim).toBe(3)
    expect(mapById('seed-ring-2d').dim).toBe(2)
    expect(mapById('seed-helix-3d').dim).toBe(3)
    expect(mapById('seed-sphere-3d').dim).toBe(3)
  })

  it('exposes the relocated cloud ids for IDB pruning', () => {
    expect(SEED_MAP_IDS).toEqual(['seed-helix-3d', 'seed-sphere-3d', 'seed-ring-2d'])
  })
})

describe('source regeneration', () => {
  it('regenerates exactly pixelCount points for any count (no baked replay)', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.resolve(7)).toHaveLength(7)
      expect(m.resolve(200)).toHaveLength(200)
    }
  })

  it('normalizes every coordinate into [0,1] per axis', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      for (const pt of m.resolve(120)) {
        for (const c of pt.sample) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
        expect(pt.pos).toEqual(pt.sample)
      }
    }
  })

  it('clouds do not origin-snap on a count bump (live, not frozen)', () => {
    // A baked cloud would pad past its frozen length with the origin; a live one
    // never does — the last point is real geometry at any count.
    const ring = mapById('seed-ring-2d').resolve(300)
    const last = ring[ring.length - 1].pos!
    expect(last).not.toEqual([0, 0])
  })
})

describe('plane no-regression (byte-stable 2D baseline)', () => {
  it('reproduces the legacy grid x = col/(cols-1), y = row/(rows-1)', () => {
    const plane = mapById('plane')
    for (const count of [1024, 256, 99, 1]) {
      const { cols, rows } = squarePlaneDims(count)
      const pts = plane.resolve(count)
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = cols > 1 ? col / (cols - 1) : 0
        const y = rows > 1 ? row / (rows - 1) : 0
        expect(pts[i].sample).toEqual([x, y])
      }
    }
  })
})

describe('cube lattice', () => {
  it('orders x-fastest then y then z and spans corner to corner', () => {
    const cube = mapById('cube')
    const pts = cube.resolve(64) // side 4
    expect(pts[0].pos).toEqual([0, 0, 0])
    expect(pts[63].pos).toEqual([1, 1, 1])
    expect(pts[1].pos).toEqual([1 / 3, 0, 0])
    expect(pts[4].pos).toEqual([0, 1 / 3, 0])
    expect(pts[16].pos).toEqual([0, 0, 1 / 3])
  })

  it('collapses a degenerate single-cell lattice to the origin (shared normalize)', () => {
    const cube = mapById('cube')
    expect(cube.resolve(1)[0].pos).toEqual([0, 0, 0])
  })
})
