import { IDBFactory } from 'fake-indexeddb'
import {
  openDb,
  createPattern,
  listPatterns,
  getPattern,
  updatePattern,
  deletePattern,
  getSetting,
  setSetting,
  resetDbCache,
  createMap,
  listMaps,
  getMap,
  updateMap,
  deleteMap,
  PatternRecord,
  MapRecord,
} from './storage'

function makeDb() {
  resetDbCache()
  return openDb(new IDBFactory())
}

const PATTERN: PatternRecord = {
  id: 'p1',
  name: 'Test Pattern',
  src: 'export function render2D(index, x, y) { hsv(x, 1, 1) }',
  controls: {},
  updatedAt: 1000,
}

describe('storage — patterns', () => {
  it('creates and retrieves a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    const result = await getPattern('p1', db)
    expect(result).toEqual(PATTERN)
  })

  it('lists all patterns', async () => {
    const db = await makeDb()
    const p2 = { ...PATTERN, id: 'p2', name: 'Second' }
    await createPattern(PATTERN, db)
    await createPattern(p2, db)
    const list = await listPatterns(db)
    expect(list).toHaveLength(2)
    expect(list.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
  })

  it('returns undefined for missing pattern', async () => {
    const db = await makeDb()
    const result = await getPattern('nope', db)
    expect(result).toBeUndefined()
  })

  it('updates a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    await updatePattern('p1', { name: 'Renamed', updatedAt: 2000 }, db)
    const result = await getPattern('p1', db)
    expect(result?.name).toBe('Renamed')
    expect(result?.updatedAt).toBe(2000)
    expect(result?.src).toBe(PATTERN.src)
  })

  it('throws when updating a missing pattern', async () => {
    const db = await makeDb()
    await expect(updatePattern('nope', { name: 'x' }, db)).rejects.toThrow()
  })

  it('deletes a pattern', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    await deletePattern('p1', db)
    const result = await getPattern('p1', db)
    expect(result).toBeUndefined()
  })

  it('persists controls per pattern', async () => {
    const db = await makeDb()
    const withControls: PatternRecord = {
      ...PATTERN,
      controls: { sliderBrightness: 0.8, toggleWave: 1, hsvPicker: [0.5, 1, 0.9] },
    }
    await createPattern(withControls, db)
    const result = await getPattern('p1', db)
    expect(result?.controls).toEqual(withControls.controls)
  })

  it('round-trips the per-pattern layout selection', async () => {
    const db = await makeDb()
    const withLayout: PatternRecord = {
      ...PATTERN,
      mapId: 'cube',
      params: { rows: 8, cols: 8 },
      pixelCount: 512,
      shapeId: 'helix',
    }
    await createPattern(withLayout, db)
    const result = await getPattern('p1', db)
    expect(result).toEqual(withLayout)
  })

  it('reads a record without layout fields (schemaless defaults)', async () => {
    const db = await makeDb()
    await createPattern(PATTERN, db)
    const result = await getPattern('p1', db)
    expect(result?.mapId).toBeUndefined()
    expect(result?.pixelCount).toBeUndefined()
    expect(result?.shapeId).toBeUndefined()
  })

  it('migrates a retired surface-cube surfaceId to Flat on read (ADR-0012, #170)', async () => {
    const db = await makeDb()
    await createPattern({ ...PATTERN, surfaceId: 'surface-cube' }, db)
    expect((await getPattern('p1', db))?.surfaceId).toBe('flat')
    expect((await listPatterns(db))[0].surfaceId).toBe('flat')
  })

  it('leaves a live surfaceId untouched on read', async () => {
    const db = await makeDb()
    await createPattern({ ...PATTERN, surfaceId: 'cylinder' }, db)
    expect((await getPattern('p1', db))?.surfaceId).toBe('cylinder')
  })
})

describe('storage — maps', () => {
  const MAP: MapRecord = {
    id: 'm1',
    name: 'My Tree',
    dim: 3,
    generator: 'plane',
    params: { rows: 8, cols: 8 },
    updatedAt: 1000,
  }

  it('creates and retrieves a map', async () => {
    const db = await makeDb()
    await createMap(MAP, db)
    expect(await getMap('m1', db)).toEqual(MAP)
  })

  it('lists all maps', async () => {
    const db = await makeDb()
    await createMap(MAP, db)
    await createMap({ ...MAP, id: 'm2', name: 'Sphere' }, db)
    const list = await listMaps(db)
    expect(list.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
  })

  it('updates a map', async () => {
    const db = await makeDb()
    await createMap(MAP, db)
    await updateMap('m1', { name: 'Renamed', updatedAt: 2000 }, db)
    const result = await getMap('m1', db)
    expect(result?.name).toBe('Renamed')
    expect(result?.params).toEqual(MAP.params)
  })

  it('throws when updating a missing map', async () => {
    const db = await makeDb()
    await expect(updateMap('nope', { name: 'x' }, db)).rejects.toThrow()
  })

  it('deletes a map', async () => {
    const db = await makeDb()
    await createMap(MAP, db)
    await deleteMap('m1', db)
    expect(await getMap('m1', db)).toBeUndefined()
  })

  it('keeps patterns intact across the v1 -> v2 upgrade', async () => {
    // Open at v1 with only the patterns store, write a pattern, then reopen at
    // the current version (which adds the maps store) and confirm data survives.
    const factory = new IDBFactory()
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open('pixelblaze-ide', 1)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        db.createObjectStore('patterns', { keyPath: 'id' })
        db.createObjectStore('settings')
      }
      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
      req.onerror = () => reject(req.error)
    })
    await createPattern(PATTERN, v1)
    v1.close()

    resetDbCache()
    const v2 = await openDb(factory)
    expect(v2.version).toBe(2)
    expect(v2.objectStoreNames.contains('maps')).toBe(true)
    expect(await getPattern('p1', v2)).toEqual(PATTERN)
  })
})

describe('storage — settings', () => {
  it('sets and gets a value', async () => {
    const db = await makeDb()
    await setSetting('speed', 2, db)
    const val = await getSetting<number>('speed', db)
    expect(val).toBe(2)
  })

  it('returns undefined for missing key', async () => {
    const db = await makeDb()
    const val = await getSetting('missing', db)
    expect(val).toBeUndefined()
  })

  it('overwrites a setting', async () => {
    const db = await makeDb()
    await setSetting('brightness', 0.5, db)
    await setSetting('brightness', 0.8, db)
    const val = await getSetting<number>('brightness', db)
    expect(val).toBe(0.8)
  })
})
