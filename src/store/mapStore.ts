import { create } from 'zustand'
import {
  MapRecord,
  createMap,
  listMaps,
  updateMap,
  deleteMap,
} from '@/engine/storage'
import { createPlaneMap, type PixelMap } from '@/engine/maps'
import { SHAPES, type ShapeId } from '@/engine/shapes'
import type { LayoutSource } from '@/engine/layout'

export type { MapRecord }

export const DEFAULT_MAP_ID = 'plane'
export const DEFAULT_SHAPE_ID: ShapeId = 'line'
// Default modeled pixel count for a 1D shape embedding when a pattern carries no
// persisted count (a typical short strip). Map layouts default to rows×cols.
export const DEFAULT_SHAPE_PIXEL_COUNT = 100

// Reconstruct a runtime PixelMap (with its resolve fn) from a serializable
// generator descriptor. The generator registry grows as stock generators land
// (cube in 1b); unknown generators fall back to a plane.
export function buildMap(
  id: string,
  name: string,
  generator: string,
  params: Record<string, number>,
): PixelMap {
  switch (generator) {
    case 'plane':
    default:
      return createPlaneMap({ rows: params.rows ?? 32, cols: params.cols ?? 32 }, { id, name })
  }
}

export function mapFromRecord(r: MapRecord): PixelMap {
  return buildMap(r.id, r.name, r.generator, r.params)
}

// Built-in stock maps — generated, never persisted. The default plane uses the
// global grid seed defaults; per-pattern params are threaded in later slices.
export const STOCK_MAPS: PixelMap[] = [createPlaneMap({ rows: 32, cols: 32 })]

// The layout catalogue the "Shape" dropdown filters: every viewport shape plus
// every available map (stock + user). The pure `layoutOptions` helper does the
// sample-arity filtering; this just gathers the raw metadata.
export function layoutSource(state: Pick<MapState, 'userMaps'>): LayoutSource {
  return {
    shapes: Object.values(SHAPES).map((s) => ({ id: s.id, name: s.name, displayDim: s.displayDim })),
    maps: [
      ...STOCK_MAPS.map((m) => ({ id: m.id, name: m.name, dim: m.dim })),
      ...state.userMaps.map((m) => ({ id: m.id, name: m.name, dim: m.dim })),
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
  setActiveMap: (id: string) => void
  setActiveShape: (id: ShapeId) => void
  setActivePixelCount: (count: number | null) => void
  loadMaps: () => Promise<void>
  addMap: (record: MapRecord) => Promise<void>
  renameMap: (id: string, name: string) => Promise<void>
  removeMap: (id: string) => Promise<void>
}

export const mapInitialState = {
  activeMapId: DEFAULT_MAP_ID,
  activeShapeId: DEFAULT_SHAPE_ID,
  activePixelCount: null as number | null,
  userMaps: [] as MapRecord[],
}

// Resolve the active map id against stock maps first, then user maps, falling
// back to the default plane so the loop always has a map to iterate.
export function selectActiveMap(state: Pick<MapState, 'activeMapId' | 'userMaps'>): PixelMap {
  const stock = STOCK_MAPS.find((m) => m.id === state.activeMapId)
  if (stock) return stock
  const user = state.userMaps.find((m) => m.id === state.activeMapId)
  return user ? mapFromRecord(user) : STOCK_MAPS[0]
}

export const useMapStore = create<MapState>()((set, get) => ({
  ...mapInitialState,

  setActiveMap: (id) => set({ activeMapId: id }),
  setActiveShape: (id) => set({ activeShapeId: id }),
  setActivePixelCount: (count) => set({ activePixelCount: count }),

  loadMaps: async () => {
    const maps = await listMaps()
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
    const { activeMapId, userMaps } = get()
    set({
      userMaps: userMaps.filter((m) => m.id !== id),
      activeMapId: activeMapId === id ? DEFAULT_MAP_ID : activeMapId,
    })
  },
}))
