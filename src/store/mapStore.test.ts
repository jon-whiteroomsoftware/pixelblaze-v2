import { describe, it, expect, beforeEach } from 'vitest'
import {
  useMapStore,
  mapInitialState,
  selectActiveMap,
  mapFromRecord,
  layoutSource,
  isMapWrappable,
  canDeployMap,
  DEFAULT_MAP_BAKE_COUNT,
  STOCK_MAPS,
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_ID,
  DEFAULT_NORMALIZE_MODE,
  type MapRecord,
} from './mapStore'
import { useEditorStore, editorInitialState } from './editorStore'
import { MAP_SKELETON } from '@/engine/maps'

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('activeNormalizeMode (#174)', () => {
  it('defaults to Contain', () => {
    expect(useMapStore.getState().activeNormalizeMode).toBe('contain')
    expect(DEFAULT_NORMALIZE_MODE).toBe('contain')
  })

  it('setActiveNormalizeMode flips the mode', () => {
    useMapStore.getState().setActiveNormalizeMode('fill')
    expect(useMapStore.getState().activeNormalizeMode).toBe('fill')
    useMapStore.getState().setActiveNormalizeMode('contain')
    expect(useMapStore.getState().activeNormalizeMode).toBe('contain')
  })
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

describe('seed clouds relocated to stock (#141)', () => {
  it('exposes the example clouds as stock maps, not user maps', () => {
    expect(STOCK_MAPS.some((m) => m.id === 'seed-ring-2d')).toBe(true)
    expect(STOCK_MAPS.some((m) => m.id === 'seed-sphere-3d')).toBe(true)
  })

  it('starts "Your Maps" empty on a fresh profile', async () => {
    await useMapStore.getState().loadMaps()
    expect(useMapStore.getState().userMaps).toHaveLength(0)
  })

  it('prunes any stale seed rows a prior build persisted into the maps store', async () => {
    const seedRow: MapRecord = {
      id: 'seed-ring-2d',
      name: 'Ring (2D)',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [[0.5, 0.5]],
      updatedAt: 1000,
    }
    await useMapStore.getState().addMap(seedRow)
    await useMapStore.getState().addMap(USER_MAP)
    await useMapStore.getState().loadMaps()
    const ids = useMapStore.getState().userMaps.map((m) => m.id)
    expect(ids).not.toContain('seed-ring-2d')
    expect(ids).toContain('u1')
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

  it('marks a regular-lattice custom map wrappable, an irregular one not (#158)', () => {
    const grid: MapRecord = {
      id: 'cm-grid',
      name: 'My Grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [[0, 0], [1, 0], [0, 1], [1, 1]],
      gridDims: { cols: 2, rows: 2 },
      updatedAt: 1,
    }
    const cloud: MapRecord = {
      id: 'cm-cloud',
      name: 'My Cloud',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [[0, 0], [0.3, 0.7], [0.9, 0.1]],
      updatedAt: 1,
    }
    const src = layoutSource({ userMaps: [grid, cloud] })
    expect(src.maps.find((m) => m.id === 'cm-grid')?.wrappable).toBe(true)
    expect(src.maps.find((m) => m.id === 'cm-cloud')?.wrappable).toBe(false)
  })
})

describe('isMapWrappable (gridDims gate, #158)', () => {
  it('offers a surface to the stock Square but not to a 3D map', () => {
    expect(isMapWrappable({ id: 'plane', dim: 2 })).toBe(true)
    expect(isMapWrappable({ id: 'cube', dim: 3 })).toBe(false)
  })

  it('gates a custom 2D map on its recorded gridDims', () => {
    expect(isMapWrappable({ id: 'cm', dim: 2, gridDims: { cols: 20, rows: 10 } })).toBe(true)
    expect(isMapWrappable({ id: 'cm', dim: 2 })).toBe(false)
  })
})

const CUSTOM_MAP: MapRecord = {
  id: 'cm1',
  name: 'My Cloud',
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0], [1, 1]],
  source: 'function(pixelCount){ return [[0,0],[1,1]] }',
  updatedAt: 2000,
}

describe('editor map mode (#151)', () => {
  it('createNewMap persists a row, seeds the skeleton, and flips to map flavor', async () => {
    await useMapStore.getState().createNewMap()
    const { userMaps, editingMap, mapBaseline } = useMapStore.getState()
    // A new map is a real row immediately (no save step), open in map mode.
    expect(userMaps).toHaveLength(1)
    expect(userMaps[0].source).toBe(MAP_SKELETON)
    expect(userMaps[0].generator).toBe('custom')
    expect(userMaps[0].name).toBe('Untitled Map')
    expect(editingMap).toEqual({ kind: 'existing', id: userMaps[0].id })
    expect(mapBaseline).toBe(MAP_SKELETON)
    const ed = useEditorStore.getState()
    expect(ed.source).toBe(MAP_SKELETON)
    expect(ed.editorFlavor).toBe('map')
    expect(ed.isReadOnly).toBe(false)
  })

  it('createNewMap gives each map a unique name', async () => {
    await useMapStore.getState().createNewMap()
    await useMapStore.getState().createNewMap()
    const names = useMapStore.getState().userMaps.map((m) => m.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('openExistingMap loads a custom map source and tracks it as the baseline', () => {
    useMapStore.setState({ userMaps: [CUSTOM_MAP] })
    useMapStore.getState().openExistingMap(CUSTOM_MAP)
    expect(useMapStore.getState().editingMap).toEqual({ kind: 'existing', id: 'cm1' })
    expect(useMapStore.getState().mapBaseline).toBe(CUSTOM_MAP.source)
    // Opening a map for editing does not change the active layout (#153).
    expect(useMapStore.getState().activeMapId).toBe(DEFAULT_MAP_ID)
    expect(useEditorStore.getState().source).toBe(CUSTOM_MAP.source)
    expect(useEditorStore.getState().editorFlavor).toBe('map')
  })

  it('openExistingMap is a no-op for a record with no source (stock maps)', () => {
    const noSource: MapRecord = { ...CUSTOM_MAP, source: undefined }
    useMapStore.getState().openExistingMap(noSource)
    expect(useMapStore.getState().editingMap).toBeNull()
    expect(useEditorStore.getState().editorFlavor).toBe('pattern')
  })

  it('loadMapTemplate replaces the buffer and resets the baseline, keeping editingMap', async () => {
    await useMapStore.getState().createNewMap()
    const opened = useMapStore.getState().editingMap
    useMapStore.getState().loadMapTemplate('function(n){ return [[2,2]] }')
    expect(useEditorStore.getState().source).toBe('function(n){ return [[2,2]] }')
    expect(useMapStore.getState().mapBaseline).toBe('function(n){ return [[2,2]] }')
    expect(useMapStore.getState().editingMap).toEqual(opened)
  })

  it('closeMapEditor leaves map mode and restores the pattern flavor', async () => {
    await useMapStore.getState().createNewMap()
    useMapStore.getState().closeMapEditor()
    expect(useMapStore.getState().editingMap).toBeNull()
    expect(useMapStore.getState().mapBaseline).toBe('')
    expect(useEditorStore.getState().editorFlavor).toBe('pattern')
  })

  it('removeMap exits map mode when the deleted map was open', async () => {
    useMapStore.setState({ userMaps: [CUSTOM_MAP] })
    useMapStore.getState().openExistingMap(CUSTOM_MAP)
    await useMapStore.getState().removeMap('cm1')
    expect(useMapStore.getState().editingMap).toBeNull()
    expect(useEditorStore.getState().editorFlavor).toBe('pattern')
  })
})

const GRID_SRC = `function(pixelCount) {
  var coords = []
  for (var i = 0; i < pixelCount; i++) coords.push([i % 4, Math.floor(i / 4)])
  return coords
}`

describe('map eval/bake/deploy (#143)', () => {
  it('bakeEditingMap evaluates the buffer and bakes points/dim/gridDims into the record', async () => {
    await useMapStore.getState().createNewMap()
    const id = useMapStore.getState().editingMap!.kind === 'existing'
      ? (useMapStore.getState().editingMap as { id: string }).id
      : ''
    useEditorStore.getState().setSource(GRID_SRC)
    useMapStore.setState({ activePixelCount: 8 }) // 4 cols × 2 rows
    await useMapStore.getState().bakeEditingMap()

    const rec = useMapStore.getState().userMaps.find((m) => m.id === id)!
    expect(rec.points).toHaveLength(8)
    expect(rec.dim).toBe(2)
    expect(rec.gridDims).toEqual({ cols: 4, rows: 2 })
    expect(rec.source).toBe(GRID_SRC)
    expect(useMapStore.getState().mapEvalError).toBeNull()
  })

  it('bakes at the modeled-2D default when no pixel count is set (matches a fresh 2D pattern)', async () => {
    await useMapStore.getState().createNewMap()
    useEditorStore.getState().setSource(GRID_SRC)
    useMapStore.setState({ activePixelCount: null })
    await useMapStore.getState().bakeEditingMap()
    // No active count → bake at the count a fresh 2D pattern carries, so a map
    // authored against the common default isn't gratuitously sparse (no override).
    expect(useMapStore.getState().userMaps[0].points).toHaveLength(DEFAULT_MAP_BAKE_COUNT)
  })

  it('a baked custom map becomes selectable in the layout catalogue', async () => {
    await useMapStore.getState().createNewMap()
    useEditorStore.getState().setSource(GRID_SRC)
    useMapStore.setState({ activePixelCount: 8 })
    await useMapStore.getState().bakeEditingMap()
    const { userMaps } = useMapStore.getState()
    const ls = layoutSource({ userMaps })
    expect(ls.maps.some((m) => m.id === userMaps[0].id)).toBe(true)
  })

  it('an irregular cloud bakes with no gridDims', async () => {
    await useMapStore.getState().createNewMap()
    useEditorStore.getState().setSource(
      `function(n){ var c=[]; for(var i=0;i<n;i++){var a=i/n*6.283; c.push([Math.cos(a),Math.sin(a)]);} return c }`,
    )
    useMapStore.setState({ activePixelCount: 12 })
    await useMapStore.getState().bakeEditingMap()
    expect(useMapStore.getState().userMaps[0].gridDims).toBeUndefined()
  })

  it('bakeEditingMap surfaces an eval error and keeps the prior bake', async () => {
    await useMapStore.getState().createNewMap()
    useEditorStore.getState().setSource(GRID_SRC)
    useMapStore.setState({ activePixelCount: 8 })
    await useMapStore.getState().bakeEditingMap()

    // Now a parse-clean source that throws when run: prior points stay, error set.
    useEditorStore.getState().setSource(`function(n){ throw new Error('boom') }`)
    await useMapStore.getState().bakeEditingMap()
    const rec = useMapStore.getState().userMaps[0]
    expect(useMapStore.getState().mapEvalError).toMatch(/boom/)
    expect(rec.points).toHaveLength(8) // prior good bake intact
  })

  it('deployEditingMap selects the open map as the active layout', async () => {
    await useMapStore.getState().createNewMap()
    const id = (useMapStore.getState().editingMap as { id: string }).id
    useMapStore.getState().deployEditingMap()
    expect(useMapStore.getState().activeMapId).toBe(id)
  })
})

describe('canDeployMap', () => {
  it('allows deploy when baked and dims match the previewed pattern', () => {
    expect(canDeployMap({ hasBakedPoints: true, mapDim: 2, nativeDim: 2, hasPreviewPattern: true })).toBe(true)
  })
  it('blocks on dimensionality mismatch', () => {
    expect(canDeployMap({ hasBakedPoints: true, mapDim: 3, nativeDim: 2, hasPreviewPattern: true })).toBe(false)
  })
  it('blocks when the map has not baked yet', () => {
    expect(canDeployMap({ hasBakedPoints: false, mapDim: 2, nativeDim: 2, hasPreviewPattern: true })).toBe(false)
  })
  it('blocks when there is no pattern in the preview', () => {
    expect(canDeployMap({ hasBakedPoints: true, mapDim: 2, nativeDim: 2, hasPreviewPattern: false })).toBe(false)
  })
})
