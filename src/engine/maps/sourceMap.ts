import type { GridDims, MapPoint, NormalRecipe, PixelMap } from './types'
import { evalMapSource } from './evalMapSource'
import { normalizeAspect } from './normalize'
import { squarePlaneDims, widePlaneDims } from './plane'

// A wrappable stock generator's count→dims recipe (ADR-0010): the catalogue tags
// the entry; createSourceMap maps the tag to the live derivation. Absent ⇒ the map
// exposes no clean grid (a 3D map, an irregular cloud), so `gridDims` returns null.
export type GridRecipe = 'square' | 'wide'

const GRID_FNS: Record<GridRecipe, (pixelCount: number) => GridDims> = {
  square: squarePlaneDims,
  wide: widePlaneDims,
}

// Metadata pairing a stock map's identity with its raw `.js` source (ADR-0008).
// The source is the single source of truth; `dim`/`displayDim`/`name` are the
// thin catalogue overlay the source itself doesn't carry.
export interface SourceMapSpec {
  id: string
  name: string
  dim: 1 | 2 | 3
  displayDim?: 1 | 2 | 3
  // Raw `function(pixelCount){ … return coords }` JavaScript (Vite `?raw` text).
  source: string
  // Provenance-gated normal recipe (ADR-0011/0012): set only on a stock 3D shell
  // the catalogue vouches for, so the preview derives the matching per-point normal
  // and offers the solidity slider. Carried through onto the PixelMap.
  normals?: NormalRecipe
  // The count→grid recipe for a wrappable 2D generator (ADR-0010); absent ⇒ the
  // map has no clean lattice. Backs the PixelMap's `gridDims` method.
  grid?: GridRecipe
}

// Build a live, source-backed PixelMap. `resolve(pixelCount)` runs the raw source
// through the no-shim `new Function` primitive and the shared aspect-preserving
// normalize pass (ADR-0009), regenerating for any count (no baked replay — that is
// custom-only). The normalized coords serve as both the render-fn `sample` and the
// drawn `pos`, so a non-square stock map (e.g. a count the plane squares to N×M)
// shows its true proportion on both channels.
export function createSourceMap(spec: SourceMapSpec): PixelMap {
  return {
    id: spec.id,
    name: spec.name,
    builtin: true,
    dim: spec.dim,
    ...(spec.displayDim !== undefined ? { displayDim: spec.displayDim } : {}),
    ...(spec.normals ? { normals: spec.normals } : {}),
    gridDims: spec.grid ? (pixelCount: number) => GRID_FNS[spec.grid!](pixelCount) : () => null,
    resolve(pixelCount: number): MapPoint[] {
      const normalized = normalizeAspect(evalMapSource(spec.source, pixelCount))
      return normalized.map((c) => ({ sample: [...c], pos: [...c] as MapPoint['pos'] }))
    },
  }
}
