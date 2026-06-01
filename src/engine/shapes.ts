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

import { cylinderWallRadius, cylinderWallDiameter } from './cylinderWall'

export type ShapeId = 'line' | 'ring' | 'pole'

export interface Shape {
  id: ShapeId
  name: string
  // DISPLAY dimensionality of the embedding (not the pattern's): a line reads as
  // 1D, a ring as 2D, a helix as 3D. Gates the viewport's camera control set
  // (§5, ADR-0005) — a 1D pattern on a ring still gets the 2D top-down camera,
  // while its dispatch stays 1D (the `sample` is always empty).
  displayDim: 1 | 2 | 3
  // Solid-eligible iff the shape supplies a per-point outward normal (ADR-0011):
  // the Pole has radial normals (its solidity fade can hide its far side); the
  // flat Line and the camera-facing Ring do not and never offer the slider.
  solidEligible: boolean
  // index -> normalized [0,1]² display position. `pixelCount` sizes the path so
  // the index sequence spans it; `sample` is never read or produced here.
  // For a `displayDim:3` shape (Pole) this 2D path is never taken — the viewport
  // routes it through the 3D `positions` channel instead (see `polePositions`).
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
  solidEligible: false,
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
  solidEligible: false,
  embed(index, pixelCount) {
    const a = pixelCount > 0 ? (index / pixelCount) * TAU : 0
    return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]
  },
}

// Pole: the 1D strip helically wrapped around a cylinder, drawn in 3D (it gets
// the orbit camera, like the Cylinder surface and Cube). Unlike Line/Ring this is a
// 3D embedding, so its draw positions come from `polePositions` (the 3D channel),
// not the 2D `embed` above — which is left as a harmless centre placeholder.
//
// Wrap density is a viewport knob: `cols` = pixels per wrap (circumference
// resolution). See `polePositions` for the square-cell math. `displayDim:3`
// routes it through the orbit renderer; dispatch stays 1D (empty `sample`).
export const POLE: Shape = {
  id: 'pole',
  name: 'Pole',
  displayDim: 3,
  solidEligible: true,
  embed() {
    return [0.5, 0.5]
  },
}

export const SHAPES: Record<ShapeId, Shape> = { line: LINE, ring: RING, pole: POLE }

// --- Pole wrap geometry (shared Cylinder pi-cell math) ----------------------
//
// The strip wraps a cylinder as stacked rings (x-fastest, like the Cylinder
// map). `cols` pixels go around each wrap; `rows = ceil(N/cols)` wraps stack up
// the height. Each surface cell is kept SQUARE by the same pi-cell relationship
// the Cylinder surface uses — both call the shared `cylinderWall` helper (#159).
//
// Sliding `cols` therefore trades diameter for length while the cell stays
// square: more cols → fatter & shorter, fewer → thinner & taller. The slider is
// clamped to the taller-than-wide regime (diameter < height); the wide-and-short
// end is the 2D Cylinder surface's territory.

const POLE_MIN_COLS = 2

// The diameter (in height units) of a pole of `cols` columns over `n` pixels.
function poleDiameter(n: number, cols: number): number {
  return cylinderWallDiameter(cols, Math.ceil(n / cols))
}

// The most columns that still leave the pole taller than wide (diameter ≤ 1).
// √(πN) is the rough square boundary; we step back from it until the exact
// diameter formula (which factors in `rows-1` and the ceil) actually fits, so
// the widest pole the slider allows never exceeds square.
export function poleMaxCols(pixelCount: number): number {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  let cols = Math.max(POLE_MIN_COLS, Math.floor(Math.sqrt(Math.PI * n)))
  while (cols > POLE_MIN_COLS && poleDiameter(n, cols) > 1) cols--
  return cols
}

// Default slenderness: a long pole, height ≈ 4.5× the diameter. D ≈ cols²/(πN),
// so for height:diameter = k we want cols ≈ √(πN/k). Clamped into the valid range.
const POLE_DEFAULT_ASPECT = 4.5
export function defaultPoleCols(pixelCount: number): number {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  return clampPoleCols(n, Math.round(Math.sqrt((Math.PI * n) / POLE_DEFAULT_ASPECT)))
}

// Clamp a requested wrap density into [POLE_MIN_COLS, poleMaxCols].
export function clampPoleCols(pixelCount: number, cols: number): number {
  const max = poleMaxCols(pixelCount)
  const c = Math.round(cols) || POLE_MIN_COLS
  return Math.max(POLE_MIN_COLS, Math.min(max, c))
}

// The pole is laid ALONG the cube's body diagonal (1,1,1) rather than upright,
// so it reads askew — tilted symmetrically toward all three axes — under the
// shared three-quarter orbit camera (no per-layout camera default needed). `W`
// is the unit diagonal (the pole's long axis); `U`,`VP` are an orthonormal frame
// spanning the circular cross-section. A point is the cube centre plus a radial
// offset in the U/VP plane plus a height offset along W.
const POLE_W: readonly [number, number, number] = [
  1 / Math.sqrt(3),
  1 / Math.sqrt(3),
  1 / Math.sqrt(3),
]
const POLE_U: readonly [number, number, number] = [
  1 / Math.sqrt(2),
  -1 / Math.sqrt(2),
  0,
]
const POLE_VP: readonly [number, number, number] = [
  1 / Math.sqrt(6),
  1 / Math.sqrt(6),
  -2 / Math.sqrt(6),
]

// One pixel of the strip wrapped onto the pole: a centred cylinder of derived
// radius `rho` and unit length, oriented along the body diagonal and centred in
// the unit cube. x-fastest, matching the Cylinder surface and plane ordering.
export function polePoint(
  index: number,
  pixelCount: number,
  cols: number,
): [number, number, number] {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const c = clampPoleCols(n, cols)
  const rows = Math.ceil(n / c)
  const col = index % c
  const row = Math.floor(index / c)
  const a = (col / c) * TAU // around: one-step seam gap, like the ring
  const rho = cylinderWallRadius(c, rows) ?? 0.25
  const v = rows > 1 ? row / (rows - 1) : 0.5 // height fraction: 0..1
  const cu = rho * Math.cos(a)
  const cv = rho * Math.sin(a)
  const h = v - 0.5 // centred length offset along the diagonal: -0.5..0.5
  return [
    0.5 + cu * POLE_U[0] + cv * POLE_VP[0] + h * POLE_W[0],
    0.5 + cu * POLE_U[1] + cv * POLE_VP[1] + h * POLE_W[1],
    0.5 + cu * POLE_U[2] + cv * POLE_VP[2] + h * POLE_W[2],
  ]
}

// The outward unit normal at a pole pixel: radial in the U/VP cross-section
// plane (cos a·U + sin a·VP), pointing away from the body-diagonal axis. Unit
// length since U,VP are orthonormal; independent of the wrap radius and height.
// Preview-only (ADR-0011) — feeds the solidity terminator, never serialized.
export function poleNormal(
  index: number,
  pixelCount: number,
  cols: number,
): [number, number, number] {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const c = clampPoleCols(n, cols)
  const a = ((index % c) / c) * TAU
  const cu = Math.cos(a)
  const cv = Math.sin(a)
  return [
    cu * POLE_U[0] + cv * POLE_VP[0],
    cu * POLE_U[1] + cv * POLE_VP[1],
    cu * POLE_U[2] + cv * POLE_VP[2],
  ]
}

// One outward normal per pole index, parallel to `polePositions`.
export function poleNormals(
  pixelCount: number,
  cols: number,
): [number, number, number][] {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const out: [number, number, number][] = []
  for (let i = 0; i < n; i++) out.push(poleNormal(i, n, cols))
  return out
}

// Resolve the whole pole: one [0,1]³ display position per index.
export function polePositions(
  pixelCount: number,
  cols: number,
): [number, number, number][] {
  const n = Math.max(1, Math.floor(pixelCount) || 1)
  const out: [number, number, number][] = []
  for (let i = 0; i < n; i++) out.push(polePoint(i, n, cols))
  return out
}

// Resolve a whole 1D path: one display position per index, 0 .. pixelCount-1.
// Pure over `pixelCount` — touches no `sample`.
export function embedPositions(shape: Shape, pixelCount: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < pixelCount; i++) out.push(shape.embed(i, pixelCount))
  return out
}
