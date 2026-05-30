import type { MapPoint, PixelMap } from './types'

export interface PlaneParams {
  rows: number
  cols: number
}

// Normalize an integer position on [0, n) into [0, 1], matching the legacy grid
// loop's per-axis normalization (`x = col/(cols-1)`). A single-cell axis maps to
// 0 (avoids divide-by-zero), as the old renderer did.
function norm(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0
}

// Stock 2D plane / grid — the existing preview grid re-expressed as a map.
// Row-major index order, matching today's `row*cols + col` exactly so the 2D
// no-regression baseline holds. `sample` and map-intrinsic `pos` coincide.
export function planePoint(index: number, params: PlaneParams): MapPoint {
  const { rows, cols } = params
  const col = index % cols
  const row = Math.floor(index / cols)
  const xy: [number, number] = [norm(col, cols), norm(row, rows)]
  return { sample: [...xy], pos: xy }
}

export function createPlaneMap(params: PlaneParams, opts: { id?: string; name?: string } = {}): PixelMap {
  return {
    id: opts.id ?? 'plane',
    name: opts.name ?? 'Plane',
    builtin: true,
    dim: 2,
    resolve(pixelCount: number): MapPoint[] {
      const points: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) points.push(planePoint(i, params))
      return points
    },
  }
}
