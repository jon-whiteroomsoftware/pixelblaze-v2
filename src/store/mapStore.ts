import { create } from 'zustand'
import {
  MapRecord,
  createMap,
  listMaps,
  updateMap,
  deleteMap,
} from '@/engine/storage'
import { createPlaneMap, type PixelMap } from '@/engine/maps'

export type { MapRecord }

export const DEFAULT_MAP_ID = 'plane'

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

interface MapState {
  activeMapId: string
  userMaps: MapRecord[]
  setActiveMap: (id: string) => void
  loadMaps: () => Promise<void>
  addMap: (record: MapRecord) => Promise<void>
  renameMap: (id: string, name: string) => Promise<void>
  removeMap: (id: string) => Promise<void>
}

export const mapInitialState = {
  activeMapId: DEFAULT_MAP_ID,
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
