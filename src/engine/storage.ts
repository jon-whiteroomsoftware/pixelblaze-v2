const DB_NAME = 'pixelblaze-ide'
const DB_VERSION = 2
const STORE_PATTERNS = 'patterns'
const STORE_SETTINGS = 'settings'
const STORE_MAPS = 'maps'

export interface PatternRecord {
  id: string
  name: string
  src: string
  controls: Record<string, number | number[]>
  updatedAt: number
  // Per-pattern layout selection (ADR-0004/0005). Optional and schemaless:
  // a record without these derives defaults on read (native dimensionality +
  // the global grid seed), so adding them needs no DB_VERSION bump.
  mapId?: string
  params?: Record<string, number>  // the active map's generator params
  pixelCount?: number
  shapeId?: string                 // 1D viewport shape embedding, if wrapped
  surfaceId?: string               // 2D viewport surface embedding (ADR-0010); 'flat' default
  solidity?: number                // preview-only back-face fade 0–1 (ADR-0011); 1.0 default, never shipped
}

// A persisted user map (Phase 2 writes these; stock maps are generated, never
// stored). Serializable form of a PixelMap: a generator descriptor + params.
export interface MapRecord {
  id: string
  name: string
  dim: 1 | 2 | 3
  generator: string                // e.g. 'plane', or 'custom' for a baked map
  params: Record<string, number>
  // Baked coordinate array for a custom map (`generator: 'custom'`), authored
  // once and replayed index-aligned by resolve (ADR-0007). Absent for stock
  // generator-based maps. Schemaless add — no DB_VERSION bump needed.
  points?: number[][]
  // The custom map's authoring source: plain JavaScript `function(pixelCount){ …
  // return coords }` (ADR-0008), never the Pixelblaze dialect and never run
  // through the fixed-point shim. A custom map is source + baked output (ADR-0007);
  // a record with no `source` (every stock map) is not openable in the editor.
  // Schemaless add — no DB_VERSION bump needed.
  source?: string
  // The custom map's recorded grid shape (ADR-0009), when its baked points form
  // a regular lattice: { cols, rows, depth? }. Captured at bake so the preview's
  // layout readout shows e.g. `20×10`; absent for an irregular point cloud.
  // Schemaless add — no DB_VERSION bump needed.
  gridDims?: { cols: number; rows: number; depth?: number }
  updatedAt: number
}

// Normalize a pattern record read from IDB against the live embedding catalogue
// (schemaless, no DB_VERSION bump — #170). The retired `surface-cube` Surface
// (ADR-0012) maps to Flat, the safe identity default, so no pattern references a
// dead embedding. Pure over the record; returns the same object when nothing
// changed, a corrected copy otherwise.
export function migratePatternRecord(record: PatternRecord): PatternRecord {
  if (record.surfaceId === 'surface-cube') {
    return { ...record, surfaceId: 'flat' }
  }
  return record
}

let _db: IDBDatabase | null = null

export function openDb(dbOverride?: IDBFactory): Promise<IDBDatabase> {
  if (_db && !dbOverride) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const factory = dbOverride ?? indexedDB
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_PATTERNS)) {
        db.createObjectStore(STORE_PATTERNS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS)
      }
      // v2: user maps live alongside patterns. Additive — existing pattern and
      // settings data carry over untouched across the 1 -> 2 upgrade.
      if (!db.objectStoreNames.contains(STORE_MAPS)) {
        db.createObjectStore(STORE_MAPS, { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!dbOverride) _db = db
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store)
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function createPattern(
  record: PatternRecord,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_PATTERNS, 'readwrite').put(record))
}

export async function listPatterns(db?: IDBDatabase): Promise<PatternRecord[]> {
  const d = db ?? (await openDb())
  const records = await wrap<PatternRecord[]>(tx(d, STORE_PATTERNS, 'readonly').getAll())
  return records.map(migratePatternRecord)
}

export async function getPattern(
  id: string,
  db?: IDBDatabase,
): Promise<PatternRecord | undefined> {
  const d = db ?? (await openDb())
  const record = await wrap<PatternRecord | undefined>(tx(d, STORE_PATTERNS, 'readonly').get(id))
  return record ? migratePatternRecord(record) : undefined
}

export async function updatePattern(
  id: string,
  changes: Partial<Omit<PatternRecord, 'id'>>,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  const store = tx(d, STORE_PATTERNS, 'readwrite')
  const existing = await wrap<PatternRecord | undefined>(store.get(id))
  if (!existing) throw new Error(`Pattern ${id} not found`)
  await wrap(
    tx(d, STORE_PATTERNS, 'readwrite').put({ ...existing, ...changes }),
  )
}

export async function deletePattern(
  id: string,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_PATTERNS, 'readwrite').delete(id))
}

// ── maps (user maps; stock maps are generated, never persisted) ──────────────

export async function createMap(record: MapRecord, db?: IDBDatabase): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_MAPS, 'readwrite').put(record))
}

export async function listMaps(db?: IDBDatabase): Promise<MapRecord[]> {
  const d = db ?? (await openDb())
  return wrap<MapRecord[]>(tx(d, STORE_MAPS, 'readonly').getAll())
}

export async function getMap(id: string, db?: IDBDatabase): Promise<MapRecord | undefined> {
  const d = db ?? (await openDb())
  return wrap<MapRecord | undefined>(tx(d, STORE_MAPS, 'readonly').get(id))
}

export async function updateMap(
  id: string,
  changes: Partial<Omit<MapRecord, 'id'>>,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  const existing = await wrap<MapRecord | undefined>(tx(d, STORE_MAPS, 'readonly').get(id))
  if (!existing) throw new Error(`Map ${id} not found`)
  await wrap(tx(d, STORE_MAPS, 'readwrite').put({ ...existing, ...changes }))
}

export async function deleteMap(id: string, db?: IDBDatabase): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_MAPS, 'readwrite').delete(id))
}

export async function getSetting<T>(
  key: string,
  db?: IDBDatabase,
): Promise<T | undefined> {
  const d = db ?? (await openDb())
  return wrap<T | undefined>(tx(d, STORE_SETTINGS, 'readonly').get(key))
}

export async function setSetting<T>(
  key: string,
  value: T,
  db?: IDBDatabase,
): Promise<void> {
  const d = db ?? (await openDb())
  await wrap(tx(d, STORE_SETTINGS, 'readwrite').put(value, key))
}

export function resetDbCache(): void {
  _db = null
}
