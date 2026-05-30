// Pure projection module for the preview's spatial layer (no DOM/React).
//
// This is the real test target behind the WebGL `renderer.ts` wrapper. It owns
// the locked-2D orthographic top-down camera: mapping a row-major pixel index
// to WebGL clip space, fit-to-container spacing, the canvas size, and the dot
// point size. The mapping is coordinate-identical to the legacy Canvas-2D grid
// (`cx = col*spacing + spacing/2`), so revealing it costs no visible change.
//
// Later slices add an orbitable 3D camera and arbitrary `pos` projection; for
// now the only exposed mode is the degenerate locked-2D case.

// Freeze guard: a single total-pixelCount ceiling, dimension-agnostic. A
// runaway count (e.g. a stale persisted blob, or a 3D map at 256³) would size
// the draw loop to something that locks the tab, so the renderer caps to this.
// 256² = 65,536 keeps the effective 2D maximum unchanged.
export const MAX_PIXEL_COUNT = 65536

// Per-axis cap kept by generators (e.g. the stock plane) so no single axis can
// balloon a map toward the total ceiling. Not the freeze guard itself.
export const MAX_GRID_AXIS = 256

// Clamp a single generator axis (rows/cols) to a sane per-axis ceiling.
export function clampGridDim(n: number): number {
  return Math.max(1, Math.min(MAX_GRID_AXIS, Math.floor(n) || 1))
}

// Clamp a total pixel count to the freeze-guard ceiling.
export function clampPixelCount(n: number): number {
  return Math.max(1, Math.min(MAX_PIXEL_COUNT, Math.floor(n) || 1))
}

export interface Locked2DGrid {
  rows: number
  cols: number
  spacing: number
}

// Canvas size in CSS pixels: cols×rows of dots at `spacing` apart, the dots
// filling the canvas exactly as the legacy grid did.
export function canvasSize(grid: Locked2DGrid): { width: number; height: number } {
  return {
    width: Math.round(grid.cols * grid.spacing),
    height: Math.round(grid.rows * grid.spacing),
  }
}

// Fit-to-container: the uniform spacing that makes `cols` dots span the
// available container width (matches Preview.tsx's ResizeObserver derivation).
export function fitSpacing(containerWidth: number, cols: number): number {
  return Math.max(1, containerWidth / Math.max(1, cols))
}

// Dot diameter in pixels — dots just touch their neighbours (legacy radius was
// max(0.5, spacing/2); diameter is the WebGL gl_PointSize).
export function pointSize(grid: Locked2DGrid): number {
  return Math.max(1, grid.spacing)
}

// Project a row-major grid index to WebGL clip space [-1,1]² (y axis up), or
// null if the index falls beyond the grid's row count. Spacing-independent: it
// cancels out of the clip mapping, so this is purely the dot centre as a
// fraction of the grid, matching the legacy `(col+0.5)/cols` dot centres.
export function projectIndex(index: number, grid: Locked2DGrid): [number, number] | null {
  const { rows, cols } = grid
  const col = index % cols
  const row = Math.floor(index / cols)
  if (row >= rows) return null
  const x = ((col + 0.5) / cols) * 2 - 1
  const y = 1 - ((row + 0.5) / rows) * 2
  return [x, y]
}

// Project a normalized [0,1]² display position (a map's intrinsic `pos`, or a
// viewport shape embedding) into WebGL clip space [-1,1]² with the y axis up.
// The locked-2D camera's pos path, parallel to the index path above; unlike
// `projectIndex` it draws wherever `pos` says, so it carries 1D shapes (line,
// ring) and any non-grid layout.
export function projectPos(pos: [number, number]): [number, number] {
  return [pos[0] * 2 - 1, 1 - pos[1] * 2]
}
