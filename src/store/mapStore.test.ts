import { describe, it, expect, beforeEach } from 'vitest'
import {
  useMapStore,
  mapInitialState,
  selectActiveMap,
  mapFromRecord,
  layoutSource,
  STOCK_MAPS,
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_ID,
  type MapRecord,
} from './mapStore'

beforeEach(() => {
  useMapStore.setState(mapInitialState)
})

const USER_MAP: MapRecord = {
  id: 'u1',
  name: 'My Tree',
  dim: 2,
  generator: 'plane',
  params: { rows: 4, cols: 4 },
  updatedAt: 1000,
}

describe('mapStore', () => {
  it('defaults to the stock plane as the active map', () => {
    expect(useMapStore.getState().activeMapId).toBe(DEFAULT_MAP_ID)
    expect(STOCK_MAPS.some((m) => m.id === DEFAULT_MAP_ID)).toBe(true)
  })

  it('setActiveMap updates the active id', () => {
    useMapStore.getState().setActiveMap('u1')
    expect(useMapStore.getState().activeMapId).toBe('u1')
  })

  it('addMap inserts the record into the library', async () => {
    await useMapStore.getState().addMap(USER_MAP)
    expect(useMapStore.getState().userMaps.map((m) => m.id)).toContain('u1')
  })

  it('removeMap drops the map and resets active to the default if it was active', async () => {
    await useMapStore.getState().addMap(USER_MAP)
    useMapStore.getState().setActiveMap('u1')
    await useMapStore.getState().removeMap('u1')
    expect(useMapStore.getState().userMaps.find((m) => m.id === 'u1')).toBeUndefined()
    expect(useMapStore.getState().activeMapId).toBe(DEFAULT_MAP_ID)
  })
})

describe('selectActiveMap', () => {
  it('returns the stock map when its id is active', () => {
    const map = selectActiveMap({ activeMapId: DEFAULT_MAP_ID, userMaps: [] })
    expect(map.id).toBe(DEFAULT_MAP_ID)
    expect(map.builtin).toBe(true)
  })

  it('returns a user map reconstructed from its record', () => {
    const map = selectActiveMap({ activeMapId: 'u1', userMaps: [USER_MAP] })
    expect(map.id).toBe('u1')
    expect(map.resolve(16)).toHaveLength(16)
  })

  it('prefers a stock map over a user map with the same id', () => {
    const shadow: MapRecord = { ...USER_MAP, id: DEFAULT_MAP_ID }
    const map = selectActiveMap({ activeMapId: DEFAULT_MAP_ID, userMaps: [shadow] })
    expect(map.builtin).toBe(true)
  })

  it('falls back to the default plane for an unknown active id', () => {
    const map = selectActiveMap({ activeMapId: 'ghost', userMaps: [] })
    expect(map.id).toBe(STOCK_MAPS[0].id)
  })
})

describe('mapFromRecord', () => {
  it('rebuilds a plane map from a descriptor', () => {
    const map = mapFromRecord(USER_MAP)
    expect(map.dim).toBe(2)
    expect(map.resolve(16)[5].sample).toEqual([1 / 3, 1 / 3]) // col 1, row 1 of 4x4
  })

  it('rebuilds a custom map by replaying its baked array', () => {
    const rec: MapRecord = {
      id: 'c1',
      name: 'Cloud',
      dim: 3,
      generator: 'custom',
      params: {},
      points: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
      updatedAt: 2000,
    }
    const map = mapFromRecord(rec)
    expect(map.builtin).toBe(false)
    expect(map.dim).toBe(3)
    expect(map.bakedCount).toBe(2)
    // Over-count replays surplus indices at the 3D origin (ADR-0007 drift).
    expect(map.resolve(3)[2].pos).toEqual([0, 0, 0])
  })
})

describe('loadMaps seeding (#140)', () => {
  it('seeds the stock custom maps idempotently', async () => {
    await useMapStore.getState().loadMaps()
    const first = useMapStore.getState().userMaps
    expect(first.some((m) => m.id === 'seed-ring-2d')).toBe(true)
    expect(first.some((m) => m.generator === 'custom' && m.dim === 3)).toBe(true)
    const countAfterFirst = first.length
    // A second load must not duplicate the seeded rows.
    await useMapStore.getState().loadMaps()
    expect(useMapStore.getState().userMaps).toHaveLength(countAfterFirst)
  })
})

describe('shape + pixel-count selection', () => {
  it('defaults activeShapeId to the line shape', () => {
    expect(useMapStore.getState().activeShapeId).toBe(DEFAULT_SHAPE_ID)
  })

  it('setActiveShape and setActivePixelCount update state', () => {
    useMapStore.getState().setActiveShape('ring')
    useMapStore.getState().setActivePixelCount(64)
    expect(useMapStore.getState().activeShapeId).toBe('ring')
    expect(useMapStore.getState().activePixelCount).toBe(64)
  })
})

describe('layoutSource', () => {
  it('gathers every shape plus stock and user maps', () => {
    const src = layoutSource({ userMaps: [USER_MAP] })
    expect(src.shapes.map((s) => s.id)).toEqual(['line', 'ring', 'pole'])
    expect(src.maps.map((m) => m.id)).toContain(STOCK_MAPS[0].id)
    expect(src.maps.map((m) => m.id)).toContain('u1')
  })
})
