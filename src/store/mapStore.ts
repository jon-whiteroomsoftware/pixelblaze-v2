import { create } from 'zustand'
import {
  MapRecord,
  createMap,
  listMaps,
  updateMap,
  deleteMap,
} from '@/engine/storage'
import {
  createCustomMap,
  createSourceMap,
  SOURCE_STOCK_MAPS,
  SEED_MAP_IDS,
  stockMapSpec,
  MAP_SKELETON,
  bakeMapSource,
  type GridDims,
  type PixelMap,
  type NormalizeMode,
} from '@/engine/maps'
import { SHAPES, type ShapeId } from '@/engine/shapes'
import { SURFACES, type SurfaceId } from '@/engine/surfaces'
import type { LayoutSource } from '@/engine/layout'
import { uniquePatternName } from '@/engine/patternName'
import { useEditorStore } from './editorStore'
import { usePatternStore } from './patternStore'

export type { MapRecord }

export const DEFAULT_MAP_ID = 'plane'
export const DEFAULT_SHAPE_ID: ShapeId = 'line'
// Default 2D viewport surface embedding (ADR-0010): Flat (the identity — the
// plain 2D preview). Selecting a wrappable map never surprise-wraps.
export const DEFAULT_SURFACE_ID: SurfaceId = 'flat'
// Default solidity (ADR-0011): solid is the common physical case, so an eligible
// embedding opens fully solid (1.0). A demo's recommended-solidity may override
// this on open; a custom pattern persists whatever the user sets.
export const DEFAULT_SOLIDITY = 1
// Default map-coordinate normalization mode (#174): Contain (aspect-preserving,
// longest-axis anchor — ADR-0009). Matches the Mapper's default selection, so an
// existing pattern with no persisted mode previews exactly as before.
export const DEFAULT_NORMALIZE_MODE: NormalizeMode = 'contain'

// The stock 2D grid generators that expose a clean integer cols×rows lattice a
// surface can wrap (ADR-0010). The Square and Wide maps qualify; the example
// clouds (ring) and 3D maps do not. Custom maps advertise their grid via the
// `gridDims` recorded at bake instead.
const WRAPPABLE_STOCK_IDS = new Set(['plane', 'wide'])
// Default modeled pixel count for a 1D shape embedding when a pattern carries no
// persisted count (a typical short strip). Map layouts default to rows×cols.
export const DEFAULT_SHAPE_PIXEL_COUNT = 100
// Points per axis for the stock cube lattice (side³ pixels = 512 at 8).
export const DEFAULT_CUBE_SIDE = 8
// Default modeled pixel count for a 2D plane when a pattern carries no persisted
// count: a 64×64 square.
export const DEFAULT_PLANE_PIXEL_COUNT = 4096
// The pixel count a custom map's source is evaluated at when baking (ADR-0008),
// used only when no count is modeled. A map's geometry is authored for a snapshot
// count; lacking a dedicated map-count control yet, bake at the active modeled
// count when present, else the count a fresh 2D pattern carries — so a map authored
// against the common 64×64 default bakes dense and matches by default, without ever
// pinning or overriding the count (ADR-0004). The function's own return length
// becomes `bakedCount`; the modeled count stays a free knob and a genuine count/map
// mismatch still renders honestly + warns (#144), the intentional drift of ADR-0007.
export const DEFAULT_MAP_BAKE_COUNT = DEFAULT_PLANE_PIXEL_COUNT

// The pixel count a freshly-opened pattern of the given display dimensionality
// defaults to when it carries no persisted count. 1D → a short strip; 2D → a
// 64×64 square; 3D → the stock 8³ cube. The count is the single user knob
// (ADR-0004); each map then arranges it per its own geometry.
export function defaultPixelCountForDim(dim: 1 | 2 | 3): number {
  if (dim === 1) return DEFAULT_SHAPE_PIXEL_COUNT
  if (dim === 3) return DEFAULT_CUBE_SIDE * DEFAULT_CUBE_SIDE * DEFAULT_CUBE_SIDE
  return DEFAULT_PLANE_PIXEL_COUNT
}

// Reconstruct a runtime PixelMap (with its resolve fn) from a serializable
// generator descriptor. Stock generators (plane/cube) are source-backed
// (ADR-0008): rebuild them from their `.js` source so a saved stock reference and
// the live stock map run identical code. Unknown generators fall back to a plane.
export function buildMap(id: string, name: string, generator: string): PixelMap {
  const spec = stockMapSpec(generator) ?? stockMapSpec('plane')!
  return createSourceMap({ ...spec, id, name })
}

// Whether a map exposes a grid a surface can wrap (ADR-0010): a stock grid
// generator, or a custom map with recorded lattice dims. Only 2D maps qualify.
// A structural check over a map RECORD's shape (id/dim/baked dims) — the runtime
// `PixelMap.gridDims(count)` method (which the resolver reads) supersedes the old
// free `mapGridDims` helper for the live grid; this stays record-oriented because
// it runs over the catalogue/`userMaps` before a runtime map is built.
export function isMapWrappable(map: { id: string; dim: 1 | 2 | 3; gridDims?: GridDims }): boolean {
  return map.dim === 2 && (WRAPPABLE_STOCK_IDS.has(map.id) || !!map.gridDims)
}

export function mapFromRecord(r: MapRecord): PixelMap {
  // A custom map replays its baked coordinate array (ADR-0007); stock generators
  // rebuild live from params. The recorded grid dims ride along for the readout.
  if (r.generator === 'custom') {
    return createCustomMap(r.points ?? [], { id: r.id, name: r.name, gridDims: r.gridDims })
  }
  return buildMap(r.id, r.name, r.generator)
}

// Built-in stock maps — source-backed (ADR-0008), regenerated live, never
// persisted. The plane and cube run their `.js` source. The relocated #140
// example clouds (sphere/ring) are now live builtin generators too — stock
// by provenance, never listed in "Your Maps" (#141). The cylinder is no longer a
// stock map: it is a viewport Surface (ADR-0010) composed onto the Square.
export const STOCK_MAPS: PixelMap[] = SOURCE_STOCK_MAPS

// Resolve a map id to its runtime PixelMap (stock or user). Falls back to the
// stock plane for an unknown id, mirroring `buildMap`'s default.
export function resolveMap(mapId: string, userMaps: MapRecord[]): PixelMap {
  const stock = STOCK_MAPS.find((m) => m.id === mapId)
  if (stock) return stock
  const user = userMaps.find((m) => m.id === mapId)
  if (user) return mapFromRecord(user)
  return STOCK_MAPS[0]
}

// The layout catalogue the Map + embedding controls filter (ADR-0010): every
// viewport shape, every surface, and every available map (stock + user). The
// pure `mapOptions`/`embeddingOptions` helpers do the dimension/wrappability
// filtering; this just gathers the raw metadata. Each map advertises whether a
// surface can wrap it (`wrappable`).
export function layoutSource(state: Pick<MapState, 'userMaps'>): LayoutSource {
  return {
    shapes: Object.values(SHAPES).map((s) => ({ id: s.id, name: s.name, displayDim: s.displayDim })),
    surfaces: Object.values(SURFACES).map((s) => ({
      id: s.id,
      name: s.name,
      displayDim: s.displayDim,
      needsGrid: s.needsGrid,
    })),
    maps: [
      ...STOCK_MAPS.map((m) => ({
        id: m.id,
        name: m.name,
        dim: m.dim,
        displayDim: m.displayDim,
        wrappable: isMapWrappable({ id: m.id, dim: m.dim }),
        stock: true,
      })),
      // A custom map can only resolve as a layout once it has baked points; a
      // freshly-created map has none until #143 bakes it, so keep it out of the
      // layout catalogue (it would throw in createCustomMap). Non-custom user maps
      // regenerate from params and are always selectable.
      ...state.userMaps
        .filter((m) => m.generator !== 'custom' || (m.points?.length ?? 0) > 0)
        .map((m) => ({
          id: m.id,
          name: m.name,
          dim: m.dim,
          wrappable: isMapWrappable({ id: m.id, dim: m.dim, gridDims: m.gridDims }),
          stock: false,
        })),
    ],
  }
}

// Pure gate for the map editor's "Deploy to preview" action (#143). The map's
// source compiling (green badge) is independent of the preview; deploy is only
// allowed when the open map has baked cleanly AND its sample dimensionality
// matches the native dim of the pattern currently running in the preview — a 2D
// map can only be pushed onto a 2D pattern, 3D onto 3D. With no pattern in the
// preview there is nothing to deploy onto.
export function canDeployMap(args: {
  hasBakedPoints: boolean
  mapDim: 1 | 2 | 3 | undefined
  nativeDim: 1 | 2 | 3
  hasPreviewPattern: boolean
}): boolean {
  return args.hasBakedPoints && args.hasPreviewPattern && args.mapDim === args.nativeDim
}

interface MapState {
  activeMapId: string
  // The active 1D viewport shape embedding (ADR-0005). Lives alongside
  // `activeMapId` because the "Shape" dropdown blurs both into one knob; which
  // one is live is decided by the pattern's native dimensionality (1D → shape).
  activeShapeId: ShapeId
  // The active 2D viewport surface embedding (ADR-0010). Lives alongside
  // `activeMapId` because the embedding control owns `pos` while the map owns
  // `sample`; which embedding axis is live is decided by the pattern's native
  // dimensionality (1D → shape, 2D → surface).
  activeSurfaceId: SurfaceId
  // The modeled pixel count for the active layout, or null to derive a default
  // (the global grid's rows×cols for a map; a 1D default for a shape).
  activePixelCount: number | null
  // The active layout's solidity (0–1, ADR-0011): a preview-only, per-pattern
  // back-face terminator floor. Lives alongside the embedding selection because
  // it is a modifier on the chosen embedding; consumed only when that embedding
  // is solid-eligible. Never serialized toward a controller.
  activeSolidity: number
  // The active map's normalization mode (#174): Contain (default) or Fill. A real
  // hardware Mapper setting (unlike solidity), but modeled per-pattern here beside
  // the other layout selections — the deck displays it in the Pixelblaze group
  // ("blur in UI, clean abstraction underneath"). Applied live to resolved map
  // coords (applyNormalizeMode); persisted on the PatternRecord as `normalize`.
  activeNormalizeMode: NormalizeMode
  userMaps: MapRecord[]
  // The map open in editor "map mode" (#151), or null when the editor holds a
  // pattern/demo/library. Every custom map is persisted on creation (like a
  // pattern), so a map open for editing is always an `existing` record.
  editingMap: EditingMap
  // The last-loaded source baseline (skeleton or a "Load template" selection) the
  // dirty-guard compares the buffer against before overwriting (#151).
  mapBaseline: string
  // The latest bake error for the open map: parses (green badge) but throws or
  // returns bad coords when evaluated (#143). Null when the last bake succeeded.
  // Surfaced in the map header; disables "Deploy to preview".
  mapEvalError: string | null
  setActiveMap: (id: string) => void
  setActiveShape: (id: ShapeId) => void
  setActiveSurface: (id: SurfaceId) => void
  setActivePixelCount: (count: number | null) => void
  setActiveSolidity: (solidity: number) => void
  setActiveNormalizeMode: (mode: NormalizeMode) => void
  // Create a fresh custom map (skeleton source), persist it immediately as a row
  // in "Your Maps" (no save step, mirroring New Pattern), and open it in map mode.
  createNewMap: () => Promise<void>
  // Open editor map mode on a saved custom map's source. No-op for a record with
  // no source (a stock map is never openable, isMapOpenable).
  openExistingMap: (record: MapRecord) => void
  // Replace the editor buffer with a template's verbatim source and reset the
  // dirty-guard baseline to it ("Load template").
  loadMapTemplate: (source: string) => void
  // Evaluate + bake the open map's current source (ADR-0008): persist the source
  // (re-editable) and, on a clean eval, the baked points/dim/gridDims into the
  // record so it becomes a usable layout. Driven by the editor's periodic sync
  // tick when the parse badge is green. An eval failure persists source only,
  // records mapEvalError, and leaves any prior bake intact — never crashes.
  bakeEditingMap: () => Promise<void>
  // Push the open map onto the running preview: select it as the active layout so
  // the currently-running pattern re-renders through its geometry. The UI gates
  // this on canDeployMap (dim match); no-op when no map is open.
  deployEditingMap: () => void
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
  activeSurfaceId: DEFAULT_SURFACE_ID,
  activePixelCount: null as number | null,
  activeSolidity: DEFAULT_SOLIDITY,
  activeNormalizeMode: DEFAULT_NORMALIZE_MODE,
  userMaps: [] as MapRecord[],
  editingMap: null as EditingMap,
  mapBaseline: '',
  mapEvalError: null as string | null,
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
  setActiveSurface: (id) => set({ activeSurfaceId: id }),
  setActivePixelCount: (count) => set({ activePixelCount: count }),
  setActiveSolidity: (solidity) =>
    set({ activeSolidity: solidity < 0 ? 0 : solidity > 1 ? 1 : solidity }),
  setActiveNormalizeMode: (mode) => set({ activeNormalizeMode: mode }),

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
      mapEvalError: null,
    })
  },

  loadMapTemplate: (source) => {
    // Verbatim source text only — not the template's name or dim (#151). The
    // baseline resets to whatever was just loaded so the dirty-guard tracks it.
    useEditorStore.getState().setSource(source)
    set({ mapBaseline: source })
  },

  bakeEditingMap: async () => {
    const { editingMap } = get()
    if (editingMap?.kind !== 'existing') return
    const id = editingMap.id
    const source = useEditorStore.getState().source
    const updatedAt = Date.now()
    try {
      const baked = bakeMapSource(source, get().activePixelCount ?? DEFAULT_MAP_BAKE_COUNT)
      // gridDims explicitly cleared (set undefined) when the points are an
      // irregular cloud, so a prior lattice's dims don't linger on the record.
      const patch = {
        source,
        points: baked.points,
        dim: baked.dim,
        gridDims: baked.gridDims ?? undefined,
        updatedAt,
      }
      await updateMap(id, patch)
      set((s) => ({
        mapEvalError: null,
        userMaps: s.userMaps.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      }))
    } catch (e) {
      // Parses but fails to evaluate: keep the edits (persist source), keep any
      // prior good bake, and surface the error rather than crashing the preview.
      await updateMap(id, { source, updatedAt }).catch(() => {})
      set((s) => ({
        mapEvalError: (e as Error).message,
        userMaps: s.userMaps.map((m) => (m.id === id ? { ...m, source, updatedAt } : m)),
      }))
    }
  },

  deployEditingMap: () => {
    const { editingMap } = get()
    if (editingMap?.kind !== 'existing') return
    // Select the open map as the active layout; the still-running preview pattern
    // rebuilds against it (Preview's effect keys on activeMapId). Enablement
    // (dim match) is the UI's job via canDeployMap.
    set({ activeMapId: editingMap.id })
  },

  closeMapEditor: () => {
    set({ editingMap: null, mapBaseline: '', mapEvalError: null })
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
