import type { Settings } from './settings'
import type { BindingStore, ProgramLabelStore } from './controllerBinding'

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
  // The active map's generator params. Not a cascaded setting (it rides with the
  // map, not the four-layer settings cascade), so it stays a flat field.
  params?: Record<string, number>
  // Sparse per-pattern settings overrides — cascade layer 1 (ADR-0013). Written
  // only on genuine user manipulation of a control; a field absent here flows from
  // a lower cascade layer (recommended / global-sticky / dev-default). Supersedes
  // the former flat layout fields (mapId/shapeId/surfaceId/pixelCount/solidity/
  // normalize), now lifted in here, plus the newly-cascaded brightness/speed and the
  // hybrid lightSize/diffusion. Optional + schemaless — no DB_VERSION bump.
  settings?: Partial<Settings>
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

// The former flat layout fields, now lifted into the nested `settings` bag
// (ADR-0013). A pre-0013 record carries these on the top level; the migration moves
// them into `settings` and strips them from the root.
const LEGACY_FLAT_SETTING_KEYS = [
  'mapId',
  'shapeId',
  'surfaceId',
  'pixelCount',
  'solidity',
  'normalize',
] as const

// Normalize a pattern record read from IDB (schemaless, no DB_VERSION bump). Two
// concerns, in order:
//   1. ADR-0013: lift the former flat layout fields into the nested `settings` bag,
//      stripping them from the root, so the override set is one cohesive Partial.
//   2. #170/#173: correct stale embedding ids inside `settings` — the retired
//      `surface-cube` Surface (ADR-0012) maps to Flat, and the retired wireframe
//      `star` map splits into Star (shell), the faceted default.
// Pure over the record; idempotent (an already-migrated record is untouched).
export function migratePatternRecord(record: PatternRecord): PatternRecord {
  const raw = record as unknown as PatternRecord &
    Partial<Record<(typeof LEGACY_FLAT_SETTING_KEYS)[number], unknown>>

  // 1. Lift any legacy flat fields into `settings`.
  let settings: Partial<Settings> = { ...(raw.settings ?? {}) }
  let strippedAny = false
  const stripped: PatternRecord = { ...record }
  for (const key of LEGACY_FLAT_SETTING_KEYS) {
    if (key in raw && raw[key] !== undefined) {
      // Legacy flat value seeds the bag only when the bag doesn't already cover it
      // (a nested value, if present, is the newer source of truth).
      if (settings[key] === undefined) settings = { ...settings, [key]: raw[key] }
      delete (stripped as unknown as Record<string, unknown>)[key]
      strippedAny = true
    }
  }

  // 2. Correct stale embedding ids inside the bag.
  if (settings.surfaceId === 'surface-cube') settings = { ...settings, surfaceId: 'flat' }
  if (settings.mapId === 'star') settings = { ...settings, mapId: 'star-shell' }

  // Return the same object when nothing changed.
  const settingsChanged =
    JSON.stringify(settings) !== JSON.stringify(record.settings ?? {})
  if (!strippedAny && !settingsChanged) return record

  return { ...stripped, settings }
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

// ── Controller push bindings (H10, issue #202) ───────────────────────────────
//
// Per-Controller pattern→program bindings for overwrite-in-place push, persisted
// as one blob in the settings store under a fixed key. Durable device-association
// data (matches the issue's "remembered binding"), kept in the app's IndexedDB
// layer rather than UI localStorage. The decision logic over this blob is pure —
// see controllerBinding.ts.

const CONTROLLER_BINDINGS_KEY = 'controller-bindings'

export async function getControllerBindings(
  db?: IDBDatabase,
): Promise<BindingStore> {
  const stored = await getSetting<BindingStore>(CONTROLLER_BINDINGS_KEY, db)
  return stored ?? {}
}

export async function setControllerBindings(
  bindings: BindingStore,
  db?: IDBDatabase,
): Promise<void> {
  await setSetting(CONTROLLER_BINDINGS_KEY, bindings, db)
}

// Per-Controller program label cache (#237), persisted as its own blob alongside the
// overwrite bindings. Kept separate because it answers a different question (running
// program id → name, vs. pattern id → overwrite target) and keying them apart stops a
// run-only push from clobbering a saved pattern's overwrite binding. Pure logic lives
// in controllerBinding.ts (withProgramLabel).
const CONTROLLER_PROGRAM_LABELS_KEY = 'controller-program-labels'

export async function getProgramLabels(
  db?: IDBDatabase,
): Promise<ProgramLabelStore> {
  const stored = await getSetting<ProgramLabelStore>(CONTROLLER_PROGRAM_LABELS_KEY, db)
  return stored ?? {}
}

export async function setProgramLabels(
  labels: ProgramLabelStore,
  db?: IDBDatabase,
): Promise<void> {
  await setSetting(CONTROLLER_PROGRAM_LABELS_KEY, labels, db)
}

export function resetDbCache(): void {
  _db = null
}
