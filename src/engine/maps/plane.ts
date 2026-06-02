import type { MapPoint, PixelMap } from './types'

// Plane grid math + a general rows×cols grid builder.
//
// The STOCK plane map is now source-backed (sources/plane.js, ADR-0008) — that
// `.js` is the single source of truth the live preview runs. `createPlaneMap`
// here is NOT that stock map; it is a general utility that lays out an EXPLICIT
// rows×cols grid (the shim's default render surface, fixed-grid test fixtures).
// It and the `.js` source agree on coordinates for a squared-up count, but the
// builder also handles arbitrary non-square grids the count-driven source does
// not. `squarePlaneDims` is the shared count→dims helper both the preview's
// layout readout and the `.js` source's `cols = ceil(sqrt(n))` rely on.

export interface PlaneParams {
  rows: number
  cols: number
}

// Lay a bare pixel count out as the most-square plane that holds it (ADR-0004:
// the count is the knob; the map decides the arrangement, and the stock plane
// has no aspect to honour, so it squares up). `cols = ceil(sqrt(n))` then
// `rows = ceil(n/cols)`, so the grid is always wide-enough and at most one row
// is partial (e.g. 99 → 10×10 with the last cell unused).
export function squarePlaneDims(pixelCount: number): PlaneParams {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  return { rows, cols }
}

// The Wide 2:1 grid's count→dims, mirroring sources/wide.js: `rows =
// ceil(sqrt(n/2))` so `cols = ceil(n/rows)` comes out roughly twice the rows.
// The live preview readout and the cylinder wrap both derive dims from this, the
// same way `squarePlaneDims` backs the Square map.
export function widePlaneDims(pixelCount: number): PlaneParams {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const rows = Math.ceil(Math.sqrt(n / 2))
  const cols = Math.ceil(n / rows)
  return { rows, cols }
}

// Normalize an integer position on [0, n) into [0, 1], matching the legacy grid
// loop's per-axis normalization (`x = col/(cols-1)`). A single-cell axis maps to
// 0 (avoids divide-by-zero), as the old renderer did.
function norm(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0
}

// One pixel of an explicit rows×cols grid. Row-major index order, matching the
// legacy `row*cols + col` exactly so the 2D no-regression baseline holds.
// `sample` and map-intrinsic `pos` coincide.
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
    // A fixed-grid plane: its dims are the explicit params, count-independent.
    gridDims: () => ({ cols: params.cols, rows: params.rows }),
    resolve(pixelCount: number): MapPoint[] {
      const points: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) points.push(planePoint(i, params))
      return points
    },
  }
}
