import { create } from 'zustand'
import {
  MapRecord,
  createMap,
  listMaps,
  updateMap,
  deleteMap,
} from '@/engine/storage'
import {
  createCylinderMap,
  createCustomMap,
  createSourceMap,
  SOURCE_STOCK_MAPS,
  SEED_MAP_IDS,
  stockMapSpec,
  MAP_SKELETON,
  type PixelMap,
} from '@/engine/maps'
import { SHAPES, type ShapeId } from '@/engine/shapes'
import type { LayoutSource } from '@/engine/layout'
import { uniquePatternName } from '@/engine/patternName'
import { useEditorStore } from './editorStore'
import { usePatternStore } from './patternStore'

export type { MapRecord }

export const DEFAULT_MAP_ID = 'plane'
export const DEFAULT_SHAPE_ID: ShapeId = 'line'
// Default modeled pixel count for a 1D shape embedding when a pattern carries no
// persisted count (a typical short strip). Map layouts default to rows×cols.
export const DEFAULT_SHAPE_PIXEL_COUNT = 100
// Points per axis for the stock cube lattice (side³ pixels = 512 at 8).
export const DEFAULT_CUBE_SIDE = 8
// Default modeled pixel count for a 2D plane when a pattern carries no persisted
// count: a 32×32 square, matching the legacy default grid.
export const DEFAULT_PLANE_PIXEL_COUNT = 1024

// The pixel count a freshly-opened pattern of the given display dimensionality
// defaults to when it carries no persisted count. 1D → a short strip; 2D → a
// 32×32 square; 3D → the stock 8³ cube. The count is the single user knob
// (ADR-0004); each map then arranges it per its own geometry.
export function defaultPixelCountForDim(dim: 1 | 2 | 3): number {
  if (dim === 1) return DEFAULT_SHAPE_PIXEL_COUNT
  if (dim === 3) return DEFAULT_CUBE_SIDE * DEFAULT_CUBE_SIDE * DEFAULT_CUBE_SIDE
  return DEFAULT_PLANE_PIXEL_COUNT
}

// Reconstruct a runtime PixelMap (with its resolve fn) from a serializable
// generator descriptor. Stock generators (plane/cube) are source-backed
// (ADR-0008): rebuild them from their `.js` source so a saved stock reference and
// the live stock map run identical code. The cylinder keeps its TS form (no
// source — the ADR-0008 exception). Unknown generators fall back to a plane.
export function buildMap(
  id: string,
  name: string,
  generator: string,
  params: Record<string, number>,
): PixelMap {
  if (generator === 'cylinder') {
    return createCylinderMap({ rows: params.rows ?? 32, cols: params.cols ?? 32 }, { id, name })
  }
  const spec = stockMapSpec(generator) ?? stockMapSpec('plane')!
  return createSourceMap({ ...spec, id, name })
}

export function mapFromRecord(r: MapRecord): PixelMap {
  // A custom map replays its baked coordinate array (ADR-0007); stock generators
  // rebuild live from params.
  if (r.generator === 'custom') {
    return createCustomMap(r.points ?? [], { id: r.id, name: r.name })
  }
  return buildMap(r.id, r.name, r.generator, r.params)
}

// Built-in stock maps — source-backed (ADR-0008), regenerated live, never
// persisted. The plane and cube run their `.js` source; the cylinder keeps its
// TS form (no source). The relocated #140 example clouds (helix/sphere/ring) are
// now live builtin generators too — stock by provenance, never listed in "Your
// Maps" (#141). The cylinder slots in after the plane for list ordering.
export const STOCK_MAPS: PixelMap[] = (() => {
  const byId = new Map(SOURCE_STOCK_MAPS.map((m) => [m.id, m]))
  const plane = byId.get('plane')!
  const rest = SOURCE_STOCK_MAPS.filter((m) => m.id !== 'plane')
  return [plane, createCylinderMap({ rows: 32, cols: 32 }), ...rest]
})()

// Resolve a map id to its runtime PixelMap (stock or user). Falls back to the
// stock plane for an unknown id, mirroring `buildMap`'s default.
export function resolveMap(mapId: string, userMaps: MapRecord[]): PixelMap {
  const stock = STOCK_MAPS.find((m) => m.id === mapId)
  if (stock) return stock
  const user = userMaps.find((m) => m.id === mapId)
  if (user) return mapFromRecord(user)
  return STOCK_MAPS[0]
}

// The layout catalogue the "Shape" dropdown filters: every viewport shape plus
// every available map (stock + user). The pure `layoutOptions` helper does the
// sample-arity filtering; this just gathers the raw metadata.
export function layoutSource(state: Pick<MapState, 'userMaps'>): LayoutSource {
  return {
    shapes: Object.values(SHAPES).map((s) => ({ id: s.id, name: s.name, displayDim: s.displayDim })),
    maps: [
      ...STOCK_MAPS.map((m) => ({ id: m.id, name: m.name, dim: m.dim, displayDim: m.displayDim })),
      // A custom map can only resolve as a layout once it has baked points; a
      // freshly-created map has none until #143 bakes it, so keep it out of the
      // layout catalogue (it would throw in createCustomMap). Non-custom user maps
      // regenerate from params and are always selectable.
      ...state.userMaps
        .filter((m) => m.generator !== 'custom' || (m.points?.length ?? 0) > 0)
        .map((m) => ({ id: m.id, name: m.name, dim: m.dim })),
    ],
  }
}

interface MapState {
  activeMapId: string
  // The active 1D viewport shape embedding (ADR-0005). Lives alongside
  // `activeMapId` because the "Shape" dropdown blurs both into one knob; which
  // one is live is decided by the pattern's native dimensionality (1D → shape).
  activeShapeId: ShapeId
  // The modeled pixel count for the active layout, or null to derive a default
  // (the global grid's rows×cols for a map; a 1D default for a shape).
  activePixelCount: number | null
  userMaps: MapRecord[]
  // The map open in editor "map mode" (#151), or null when the editor holds a
  // pattern/demo/library. Every custom map is persisted on creation (like a
  // pattern), so a map open for editing is always an `existing` record.
  editingMap: EditingMap
  // The last-loaded source baseline (skeleton or a "Load template" selection) the
  // dirty-guard compares the buffer against before overwriting (#151).
  mapBaseline: string
  setActiveMap: (id: string) => void
  setActiveShape: (id: ShapeId) => void
  setActivePixelCount: (count: number | null) => void
  // Create a fresh custom map (skeleton source), persist it immediately as a row
  // in "Your Maps" (no save step, mirroring New Pattern), and open it in map mode.
  createNewMap: () => Promise<void>
  // Open editor map mode on a saved custom map's source. No-op for a record with
  // no source (a stock map is never openable, isMapOpenable).
  openExistingMap: (record: MapRecord) => void
  // Replace the editor buffer with a template's verbatim source and reset the
  // dirty-guard baseline to it ("Load template").
  loadMapTemplate: (source: string) => void
  // Leave map mode (selecting a pattern/demo/library). Clears editingMap and
  // restores the pattern editor flavor.
  closeMapEditor: () => void
  loadMaps: () => Promise<void>
  addMap: (record: MapRecord) => Promise<void>
  renameMap: (id: string, name: string) => Promise<void>
  removeMap: (id: string) => Promise<void>
}

export type EditingMap = { kind: 'existing'; id: string } | null

export const mapInitialState = {
  activeMapId: DEFAULT_MAP_ID,
  activeShapeId: DEFAULT_SHAPE_ID,
  activePixelCount: null as number | null,
  userMaps: [] as MapRecord[],
  editingMap: null as EditingMap,
  mapBaseline: '',
}

// Resolve the active map id against stock maps first, then user maps, falling
// back to the default plane so the loop always has a map to iterate.
export function selectActiveMap(state: Pick<MapState, 'activeMapId' | 'userMaps'>): PixelMap {
  const stock = STOCK_MAPS.find((m) => m.id === state.activeMapId)
  if (stock) return stock
  const user = state.userMaps.find((m) => m.id === state.activeMapId)
  return user ? mapFromRecord(user) : STOCK_MAPS[0]
}

// Switch the editor surface into map mode on the given source: clear any active
// pattern/demo/library, flip the editor to the JS map flavor (editable, parse-only
// badge), and load the buffer. The compile badge re-derives from the source via
// the Editor's parse pass; we seed 'good' so the badge doesn't flash stale.
function enterMapMode(source: string): void {
  usePatternStore.getState().setActivePattern(null)
  const ed = useEditorStore.getState()
  ed.setEditorFlavor('map')
  ed.setIsReadOnly(false)
  ed.setSource(source)
  ed.setCompileStatus('good')
}

export const useMapStore = create<MapState>()((set, get) => ({
  ...mapInitialState,

  setActiveMap: (id) => set({ activeMapId: id }),
  setActiveShape: (id) => set({ activeShapeId: id }),
  setActivePixelCount: (count) => set({ activePixelCount: count }),

  createNewMap: async () => {
    // Mirror New Pattern: a custom map is a real row the instant you create it —
    // no save step (#151 follow-up). The skeleton is the authoring source; dim is
    // a 2D placeholder and there are no baked points yet (source eval/bake is
    // #143). Persist, then open it in map mode like any existing map.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = uniquePatternName('Untitled Map', get().userMaps.map((m) => m.name))
    const record: MapRecord = {
      id,
      name,
      dim: 2,
      generator: 'custom',
      params: {},
      source: MAP_SKELETON,
      updatedAt: Date.now(),
    }
    await get().addMap(record)
    get().openExistingMap(record)
  },

  openExistingMap: (record) => {
    // Stock maps carry no source and are never openable in place (#151, ADR-0008).
    if (typeof record.source !== 'string') return
    enterMapMode(record.source)
    // Opening a map for editing does NOT change the active layout/preview
    // (activeMapId): map preview is deferred (#153), and an unbaked custom map
    // can't resolve as a layout anyway.
    set({
      editingMap: { kind: 'existing', id: record.id },
      mapBaseline: record.source,
    })
  },

  loadMapTemplate: (source) => {
    // Verbatim source text only — not the template's name or dim (#151). The
    // baseline resets to whatever was just loaded so the dirty-guard tracks it.
    useEditorStore.getState().setSource(source)
    set({ mapBaseline: source })
  },

  closeMapEditor: () => {
    set({ editingMap: null, mapBaseline: '' })
    useEditorStore.getState().setEditorFlavor('pattern')
  },

  loadMaps: async () => {
    // "Your Maps" lists user-authored maps only (#141). The #140 example clouds
    // are now stock (in STOCK_MAPS), so prune any rows an earlier build seeded
    // into the IDB `maps` store before they were relocated — otherwise they'd
    // show up duplicated under "Your Maps".
    const existing = await listMaps()
    const stale = existing.filter((m) => SEED_MAP_IDS.includes(m.id))
    for (const m of stale) await deleteMap(m.id)
    const maps = stale.length ? existing.filter((m) => !SEED_MAP_IDS.includes(m.id)) : existing
    set({ userMaps: maps.sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  addMap: async (record) => {
    await createMap(record)
    set((s) => ({ userMaps: [record, ...s.userMaps] }))
  },

  renameMap: async (id, name) => {
    const updatedAt = Date.now()
    await updateMap(id, { name, updatedAt })
    set((s) => ({
      userMaps: s.userMaps.map((m) => (m.id === id ? { ...m, name, updatedAt } : m)),
    }))
  },

  removeMap: async (id) => {
    await deleteMap(id)
    const { activeMapId, userMaps, editingMap } = get()
    set({
      userMaps: userMaps.filter((m) => m.id !== id),
      activeMapId: activeMapId === id ? DEFAULT_MAP_ID : activeMapId,
    })
    // If the deleted map was open in map mode, leave the editor cleanly.
    if (editingMap?.kind === 'existing' && editingMap.id === id) get().closeMapEditor()
  },
}))
