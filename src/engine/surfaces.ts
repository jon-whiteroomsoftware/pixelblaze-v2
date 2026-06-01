// Viewport surface embeddings (ADR-0010): pure pos-only generators for 2D
// layouts. The 2D sibling of the 1D shapes in `shapes.ts`.
//
// A 2D pattern's `sample` is owned by its *map* (the `[u,v]` it reads). Where
// each dot is *drawn* in the viewport is a separate display choice owned by a
// **surface**: Flat (the identity — today's plain 2D preview) or Cylinder (the
// map's grid wrapped around a tube). A surface never touches `sample`, so the
// pattern cannot observe the wrap — only `pos` differs (the ADR-0005
// sample/position divergence, made first-class for 2D). No DOM/React imports.

import type { GridDims } from './maps/types'
import { cylinderWallRadius, cylinderWallDiameter } from './cylinderWall'

export type SurfaceId = 'flat' | 'cylinder'

export interface Surface {
  id: SurfaceId
  name: string
  // DISPLAY dimensionality of the embedding: Flat reads as a 2D layout (the
  // map's own [0,1]² positions), Cylinder draws in 3D (orbit camera, like the
  // cube). The pattern's dispatch stays 2D in both cases (the `sample` is the
  // map's, untouched).
  displayDim: 2 | 3
  // Whether the surface needs a map's integer `gridDims` to embed. Flat is the
  // identity (it just keeps the map's intrinsic `pos`), so it needs nothing;
  // Cylinder wraps the `cols` axis around the circumference, so it requires a
  // clean integer grid and is offered only for maps that have one.
  needsGrid: boolean
  // Solid-eligible iff the surface can supply a per-point outward normal
  // (ADR-0011): the curved Cylinder can, so the solidity fade may suppress its
  // back-facing points; Flat trivially faces the camera and needs nothing.
  // Volumes (the volumetric cube) are never surfaces and so never eligible.
  solidEligible: boolean
}

// Flat: the identity surface. Each dot is drawn where the map already puts it,
// so the layout is exactly the plain 2D preview. `pos` is the map's intrinsic
// position; this module produces nothing for it (the map already did).
export const FLAT: Surface = {
  id: 'flat',
  name: 'Flat',
  displayDim: 2,
  needsGrid: false,
  solidEligible: false,
}

// Cylinder: the map's cols×rows grid wrapped around a tube, drawn in 3D.
export const CYLINDER: Surface = {
  id: 'cylinder',
  name: 'Cylinder',
  displayDim: 3,
  needsGrid: true,
  solidEligible: true,
}

export const SURFACES: Record<SurfaceId, Surface> = {
  flat: FLAT,
  cylinder: CYLINDER,
}

const TAU = Math.PI * 2

// --- Cylinder wrap geometry (map-derived, ADR-0010) -------------------------
//
// The surface reads the source map's RAW integer `gridDims` (`cols×rows`), NOT
// its ADR-0009-normalized sample (which caps the longest axis at 1 and would
// flatten every map to circumference 1). `circumference:height = cols:rows`, so
// the unrolled tube *is* the map rectangle — no cell distortion. A square map
// (cols=rows) wraps to a tall slender tube (~π:1 height:diameter); a 2:1 map to
// a fatter, shorter one.
//
// The square-cell radius/diameter come from the shared `cylinderWall` helper the
// Pole also consumes (ADR-0010, #159).

// The diameter of the wrapped tube (in height units, height normalized to 1) for
// a cols×rows grid. Drives the slender/fat readout and is the geometry the tests
// assert on. A single-row grid degenerates to a ring (diameter meaningless).
export function cylinderDiameter(gridDims: GridDims): number {
  const { cols, rows } = gridDims
  return cylinderWallDiameter(cols, rows)
}

// One pixel of a cols×rows grid wrapped around a cylinder centred in the unit
// cube. Row-major index order (x-fastest), matching the plane/source maps, so
// pixel i's grid cell is (col = i%cols, row = ⌊i/cols⌋). The circumference wraps
// fully (a = col/cols·2π, a one-step seam gap like LEDs around a tube); the
// height climbs y with the row.
export function cylinderSurfacePoint(
  index: number,
  gridDims: GridDims,
): [number, number, number] {
  const { cols, rows } = gridDims
  const col = ((index % cols) + cols) % cols
  const row = Math.floor(index / cols)
  const a = cols > 0 ? (col / cols) * TAU : 0
  const v = rows > 1 ? row / (rows - 1) : 0 // height fraction 0..1 (bottom-anchored single row)
  const rho = cylinderWallRadius(cols, rows) ?? 0.5
  return [0.5 + rho * Math.cos(a), v, 0.5 + rho * Math.sin(a)]
}

// Resolve the whole wrapped surface: one [0,1]³ display position per index,
// 0 .. pixelCount-1. Pure over the count + grid dims; touches no `sample`.
export function cylinderSurfacePositions(
  pixelCount: number,
  gridDims: GridDims,
): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < pixelCount; i++) out.push(cylinderSurfacePoint(i, gridDims))
  return out
}

// The outward unit normal at a cylinder-surface pixel: radial from the tube
// axis, (cos a, 0, sin a) — independent of the wrap radius and height. Preview-
// only (ADR-0011): feeds the solidity terminator, never serialized.
export function cylinderSurfaceNormal(
  index: number,
  gridDims: GridDims,
): [number, number, number] {
  const { cols } = gridDims
  const col = cols > 0 ? ((index % cols) + cols) % cols : 0
  const a = cols > 0 ? (col / cols) * TAU : 0
  return [Math.cos(a), 0, Math.sin(a)]
}

// One outward normal per index, parallel to `cylinderSurfacePositions`.
export function cylinderSurfaceNormals(
  pixelCount: number,
  gridDims: GridDims,
): [number, number, number][] {
  const out: [number, number, number][] = []
  for (let i = 0; i < pixelCount; i++) out.push(cylinderSurfaceNormal(i, gridDims))
  return out
}

