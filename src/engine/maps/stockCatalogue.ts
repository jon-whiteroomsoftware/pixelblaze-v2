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
// The cylinder is no longer a stock map at all (ADR-0010): it is a viewport
// Surface embedding composed onto the Square map, so the ADR-0008 source-less
// stock-map exception is dissolved. The example clouds (helix/sphere/ring) are
// live builtin generators here, no longer baked arrays.
export const STOCK_MAP_SPECS: SourceMapSpec[] = [
  { id: 'plane', name: 'Square', dim: 2, source: source('plane') },
  { id: 'wide', name: 'Wide 2:1', dim: 2, source: source('wide') },
  { id: 'cube', name: 'Cube (volume)', dim: 3, source: source('cube') },
  // The faceted shell sibling of the volume cube (ADR-0012): points on the six
  // faces, solid-eligible via per-face normals the preview derives (faceNormals,
  // the dominant axis of pos − centre) rather than the sphere's centroid radial.
  { id: 'cube-shell', name: 'Cube (shell)', dim: 3, source: source('cube-shell'), normals: 'face' },
  // The Star joins the ADR-0012 shell/volume scheme (the lone wireframe star is
  // retired). The shell scatters points over the 60 stellation triangles and is
  // solid-eligible via per-face normals the preview derives (starShellNormals);
  // the volume fills the spiky solid and has no per-point normal.
  { id: 'star-shell', name: 'Star (shell)', dim: 3, source: source('star-shell'), normals: 'star' },
  { id: 'star-volume', name: 'Star (volume)', dim: 3, source: source('star-volume') },
  { id: 'seed-helix-3d', name: 'Helix (cloud)', dim: 3, source: source('helix') },
  // The Sphere is a convex shell, so the catalogue vouches it solid-eligible
  // (ADR-0011): the preview re-derives outward normals via normalize(pos −
  // centroid) and offers the solidity slider. The Helix is NOT a shell (centroid
  // normals would be wrong) and the volumetric Cube has no per-point normal, so
  // neither is flagged.
  { id: 'seed-sphere-3d', name: 'Sphere (shell)', dim: 3, source: source('sphere'), normals: 'centroid' },
  // The solid sibling of the Sphere shell (ADR-0012): points fill the interior of
  // the ball. A volume has no per-point boundary normal, so it is NOT solid-
  // eligible — it relies on the renderer's depth-tested opaque cores instead.
  { id: 'sphere-volume', name: 'Sphere (volume)', dim: 3, source: source('sphere-volume') },
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
