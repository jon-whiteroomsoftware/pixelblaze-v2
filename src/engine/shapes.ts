// Viewport shape embeddings (ADR-0005): pure pos-only generators for 1D layouts.
//
// A `render`-only (1D) pattern consumes the index alone — its `sample` is empty
// (ADR-0005), so where its dots are *drawn* is a pure display choice owned by the
// viewport, not the map. Line, ring, polygon, helix are the same index sequence
// over the same (empty) sample; they differ only in `pos`. So these embeddings
// live here in the viewport, not under `maps/`.
//
// Each generator returns `pos` only, in the same normalized [0,1]² display space
// as a map's intrinsic `pos` (see maps/plane.ts). The locked-2D camera turns that
// into clip space via `projectPos`. No DOM/React imports: this is pure engine.

export type ShapeId = 'line' | 'ring'

export interface Shape {
  id: ShapeId
  name: string
  // DISPLAY dimensionality of the embedding (not the pattern's): a line reads as
  // 1D, a ring as 2D, a helix as 3D. Gates the viewport's camera control set
  // (§5, ADR-0005) — a 1D pattern on a ring still gets the 2D top-down camera,
  // while its dispatch stays 1D (the `sample` is always empty).
  displayDim: 1 | 2 | 3
  // index -> normalized [0,1]² display position. `pixelCount` sizes the path so
  // the index sequence spans it; `sample` is never read or produced here.
  embed(index: number, pixelCount: number): [number, number]
}

const TAU = Math.PI * 2

// Line: the index sequence laid out left-to-right across the horizontal centre.
// A single pixel sits dead centre (avoids divide-by-zero), matching the plane's
// degenerate-axis convention.
export const LINE: Shape = {
  id: 'line',
  name: 'Line',
  displayDim: 1,
  embed(index, pixelCount) {
    const x = pixelCount > 1 ? index / (pixelCount - 1) : 0.5
    return [x, 0.5]
  },
}

// Ring: the index sequence wrapped once around a centred circle. `index/pixelCount`
// (not `/(pixelCount-1)`) keeps the last dot one step short of the first, so the
// chase "spins" continuously without doubling a pixel at the seam.
export const RING: Shape = {
  id: 'ring',
  name: 'Ring',
  displayDim: 2,
  embed(index, pixelCount) {
    const a = pixelCount > 0 ? (index / pixelCount) * TAU : 0
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]
  },
}

export const SHAPES: Record<ShapeId, Shape> = { line: LINE, ring: RING }

// Resolve a whole 1D path: one display position per index, 0 .. pixelCount-1.
// Pure over `pixelCount` — touches no `sample`.
export function embedPositions(shape: Shape, pixelCount: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < pixelCount; i++) out.push(shape.embed(i, pixelCount))
  return out
}
