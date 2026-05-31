import { createSourceMap, type SourceMapSpec } from './sourceMap'
import type { PixelMap } from './types'

// Raw `.js` map sources, read as text (ADR-0008): each file is a self-contained
// `function(pixelCount){ … }`, Math/built-ins only, pasteable into a real
// Pixelblaze Mapper tab. The filename is the source key.
const rawSources = import.meta.glob('./sources/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function source(name: string): string {
  const entry = rawSources[`./sources/${name}.js`]
  if (entry === undefined) throw new Error(`missing stock map source: ${name}.js`)
  return entry
}

// The thin catalogue: stock map identity/metadata paired with its `?raw` source.
// The drape cylinder is deliberately absent — it has no single faithful Mapper
// function (sample != pos), so it keeps its TS form and carries no source
// (ADR-0008 exception). The example clouds (helix/sphere/ring) are live builtin
// generators here, no longer baked arrays.
export const STOCK_MAP_SPECS: SourceMapSpec[] = [
  { id: 'plane', name: 'Plane', dim: 2, source: source('plane') },
  { id: 'cube', name: 'Cube', dim: 3, source: source('cube') },
  { id: 'seed-helix-3d', name: 'Helix (cloud)', dim: 3, source: source('helix') },
  { id: 'seed-sphere-3d', name: 'Sphere (cloud)', dim: 3, source: source('sphere') },
  { id: 'seed-ring-2d', name: 'Ring', dim: 2, source: source('ring') },
]

// The source-backed stock maps as live PixelMaps.
export const SOURCE_STOCK_MAPS: PixelMap[] = STOCK_MAP_SPECS.map(createSourceMap)

// Stable id lookup for a stock map's raw source — used by the New Map "Load
// template" path (#143/#151) and to look a spec up by id.
export function stockMapSpec(id: string): SourceMapSpec | undefined {
  return STOCK_MAP_SPECS.find((s) => s.id === id)
}

// The ids of the relocated #140 example clouds — used to prune rows an earlier
// build seeded into the `maps` IDB store before they became stock.
export const SEED_MAP_IDS: string[] = ['seed-helix-3d', 'seed-sphere-3d', 'seed-ring-2d']
