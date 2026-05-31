import type { MapPoint, PixelMap } from './types'
import { evalMapSource } from './evalMapSource'
import { normalizePerAxis } from './normalize'

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
}

// Build a live, source-backed PixelMap. `resolve(pixelCount)` runs the raw source
// through the no-shim `new Function` primitive and the shared per-axis normalize
// pass, regenerating for any count (no baked replay — that is custom-only). The
// normalized coords serve as both the render-fn `sample` and the drawn `pos`.
export function createSourceMap(spec: SourceMapSpec): PixelMap {
  return {
    id: spec.id,
    name: spec.name,
    builtin: true,
    dim: spec.dim,
    ...(spec.displayDim !== undefined ? { displayDim: spec.displayDim } : {}),
    resolve(pixelCount: number): MapPoint[] {
      const normalized = normalizePerAxis(evalMapSource(spec.source, pixelCount))
      return normalized.map((c) => ({ sample: [...c], pos: [...c] as MapPoint['pos'] }))
    },
  }
}
