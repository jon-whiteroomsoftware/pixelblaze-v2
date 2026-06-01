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

export type SurfaceId = 'flat' | 'cylinder' | 'surface-cube'

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
  // (ADR-0011): the curved/faceted embeddings (Cylinder, surface cube) can, so
  // the next slice's solidity fade may suppress their back-facing points; Flat
  // trivially faces the camera and needs nothing. Volumes (the volumetric cube)
  // are never surfaces and so never eligible.
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

// Surface cube: LEDs on the six faces of a cube (a shell), drawn in 3D. Like the
// Cylinder it is a grid-class surface offered only for wrappable maps (an
// irregular cloud stays Flat-only); this slice distributes the pixel count
// across the faces by count alone. Exposes a per-point outward face normal — the
// first faceted solid-eligible embedding (ADR-0011).
export const SURFACE_CUBE: Surface = {
  id: 'surface-cube',
  name: 'Cube (surface)',
  displayDim: 3,
  needsGrid: true,
  solidEligible: true,
}

export const SURFACES: Record<SurfaceId, Surface> = {
  flat: FLAT,
  cylinder: CYLINDER,
  'surface-cube': SURFACE_CUBE,
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

// --- Surface cube (ADR-0011 solid-eligible test bed) ------------------------
//
// LEDs arranged on the SIX FACES of a cube — a surface (a hollow shell), NOT
// the filled volumetric `cube` stock map. The pixel count is split as evenly as
// possible across the faces; each face lays its share out on a square-ish in-
// plane sub-grid of cell CENTRES, so every point sits strictly inside its face,
// never on a shared edge where the face normal would be ambiguous.
//
// Each point carries an outward unit FACE NORMAL (the dominant axis of
// pos − centre): this is the first faceted solid-eligible embedding (ADR-0011),
// the proving ground for the next slice's solidity fade. The normal is
// preview-only — never written to a map record nor sent to a controller.

export type Vec3 = [number, number, number]

export interface SurfacePoint {
  pos: Vec3
  normal: Vec3
}

// The six faces of the unit cube, each as an in-plane origin + two unit span
// axes (du, dv) and the outward normal. pos = origin + u·du + v·dv, u,v ∈ (0,1).
interface CubeFace {
  origin: Vec3
  du: Vec3
  dv: Vec3
  normal: Vec3
}

const CUBE_FACES: CubeFace[] = [
  { origin: [1, 0, 0], du: [0, 1, 0], dv: [0, 0, 1], normal: [1, 0, 0] }, // +x
  { origin: [0, 0, 0], du: [0, 1, 0], dv: [0, 0, 1], normal: [-1, 0, 0] }, // −x
  { origin: [0, 1, 0], du: [1, 0, 0], dv: [0, 0, 1], normal: [0, 1, 0] }, // +y
  { origin: [0, 0, 0], du: [1, 0, 0], dv: [0, 0, 1], normal: [0, -1, 0] }, // −y
  { origin: [0, 0, 1], du: [1, 0, 0], dv: [0, 1, 0], normal: [0, 0, 1] }, // +z
  { origin: [0, 0, 0], du: [1, 0, 0], dv: [0, 1, 0], normal: [0, 0, -1] }, // −z
]

// Split `pixelCount` across the six faces as evenly as possible: the first
// `pixelCount % 6` faces get one extra, so the totals sum back to pixelCount.
export function surfaceCubeFaceCounts(pixelCount: number): number[] {
  const n = Math.max(0, Math.floor(pixelCount))
  const base = Math.floor(n / 6)
  const extra = n % 6
  return CUBE_FACES.map((_, f) => base + (f < extra ? 1 : 0))
}

// Resolve the surface cube: one position + outward face normal per index,
// 0 .. pixelCount-1, in face order (+x, −x, +y, −y, +z, −z). Pure over the
// count alone — no map grid needed (unlike the Cylinder).
export function surfaceCubePoints(pixelCount: number): SurfacePoint[] {
  const counts = surfaceCubeFaceCounts(pixelCount)
  const out: SurfacePoint[] = []
  CUBE_FACES.forEach((face, f) => {
    const k = counts[f]
    if (k === 0) return
    const cols = Math.ceil(Math.sqrt(k))
    const rows = Math.ceil(k / cols)
    for (let j = 0; j < k; j++) {
      const u = ((j % cols) + 0.5) / cols
      const v = (Math.floor(j / cols) + 0.5) / rows
      out.push({
        pos: [
          face.origin[0] + u * face.du[0] + v * face.dv[0],
          face.origin[1] + u * face.du[1] + v * face.dv[1],
          face.origin[2] + u * face.du[2] + v * face.dv[2],
        ],
        normal: [...face.normal] as Vec3,
      })
    }
  })
  return out
}

// The display positions alone, for the renderer's existing pos3D channel.
export function surfaceCubePositions(pixelCount: number): Vec3[] {
  return surfaceCubePoints(pixelCount).map((p) => p.pos)
}

// The outward unit face normals alone (preview-only; the next slice's solidity
// fade keys on normal · viewDir). Never serialized toward a controller.
export function surfaceCubeNormals(pixelCount: number): Vec3[] {
  return surfaceCubePoints(pixelCount).map((p) => p.normal)
}
