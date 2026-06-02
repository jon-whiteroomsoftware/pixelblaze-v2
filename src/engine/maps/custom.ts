import type { GridDims, MapPoint, PixelMap } from './types'

// A baked custom map (ADR-0007): a coordinate array authored once and frozen
// into the record. Unlike stock generators (which regenerate live for any
// count), a custom map REPLAYS its frozen array, index-aligned to the requested
// count: indices past the array's end fall back to the origin, surplus entries
// go unvisited. It deliberately does NOT re-run for a new count — that staleness
// is the count/map drift this fidelity choice exists to reproduce.

export type Coord = [number, number] | [number, number, number]

// Infer DISPLAY dimensionality from the baked coordinates' arity (`[x,y]` → 2D,
// `[x,y,z]` → 3D), matching how firmware reports `pixelMapDimensions()`. Mixed
// arity, an empty list, or a non-2/3 arity is a save-time error.
export function inferDim(points: number[][]): 2 | 3 {
  if (points.length === 0) {
    throw new Error('custom map needs at least one point')
  }
  const arity = points[0].length
  if (arity !== 2 && arity !== 3) {
    throw new Error(`custom map coords must be 2D [x,y] or 3D [x,y,z], got arity ${arity}`)
  }
  for (const p of points) {
    if (p.length !== arity) {
      throw new Error(`custom map has mixed coordinate arity (expected ${arity}, got ${p.length})`)
    }
  }
  return arity
}

// Build a runtime PixelMap from a baked coordinate array. `sample` (fed to the
// render fn) and the drawn `pos` coincide, both as authored. Coordinates are
// expected normalized to [0,1] per axis (firmware-normalized map space).
export function createCustomMap(
  points: number[][],
  opts: { id: string; name: string; gridDims?: GridDims },
): PixelMap {
  const dim = inferDim(points)
  // Freeze the baked array so resolve replays (never regenerates) from it.
  const baked = points.map((p) => [...p] as Coord)
  const origin: Coord = dim === 3 ? [0, 0, 0] : [0, 0]
  return {
    id: opts.id,
    name: opts.name,
    builtin: false,
    dim,
    // Replay the grid dims recorded at bake for the layout readout (ADR-0009),
    // count-independent; null when the baked points are an irregular cloud.
    gridDims: () => opts.gridDims ?? null,
    bakedCount: baked.length,
    resolve(pixelCount: number): MapPoint[] {
      const out: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) {
        const c = i < baked.length ? baked[i] : origin
        out.push({ sample: [...c], pos: [...c] as Coord })
      }
      return out
    },
  }
}
