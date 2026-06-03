// The pixel-map data model (ADR-0004, ADR-0005).
//
// A map is a pure index -> position lookup. It does NOT own how many pixels
// exist: `resolve` is handed the modeled `pixelCount` and returns one MapPoint
// per index 0 .. pixelCount-1 (ADR-0004).

// Per-pixel resolution of the two independent channels (ADR-0005):
export interface MapPoint {
  // Normalized coordinates fed to the render fn — length matches the render fn:
  // [] (1D) | [x,y] (2D) | [x,y,z] (3D). Always owned by the map; the only thing
  // a pattern can observe.
  sample: number[]
  // Where the dot is drawn. Map-intrinsic (real geometry) when present; ABSENT
  // for a 1D map, whose `pos` is supplied by a viewport shape embedding instead.
  pos?: [number, number] | [number, number, number]
}

// The intended integer grid shape of a regular-lattice map (ADR-0009): cols
// (x-axis), rows (y-axis), and depth (z-axis) for a 3D lattice. Recorded at bake
// for a custom map that resolves to a clean lattice, so the layout readout can
// show `cols×rows(×depth)`. Absent for irregular point clouds.
export interface GridDims {
  cols: number
  rows: number
  depth?: number
}

// The recipe for a 3D shell map's per-point outward normals (ADR-0011/0012), a
// declarative tag the catalogue stamps on a map and the layout resolver maps to
// the matching derivation: `face` (the faceted Cube shell's dominant-axis normal),
// `star` (the Star shell's per-stellation-face normal), `centroid` (the generic
// `normalize(pos − centroid)` for a convex shell, e.g. the Sphere). Its PRESENCE
// is the provenance gate that makes the map solid-eligible (ADR-0011) — absent for
// volumes and irregular clouds, which never offer the solidity slider.
export type NormalRecipe = 'face' | 'star' | 'tetra' | 'centroid'

export interface PixelMap {
  id: string
  name: string
  builtin: boolean
  // SAMPLE arity — the coord-arg count fed to the render fn, and what the layout
  // selector filters on (a `dim:2` map is offered to render2D patterns). For
  // every current map this also equals how it's drawn (no map samples and draws
  // in different dimensions any more — the cylinder's old 2D-sample/3D-draw split
  // is now a viewport Surface, ADR-0010); `displayDim` remains for a future map
  // that needs it.
  dim: 1 | 2 | 3
  // How the map is DRAWN, when it differs from `dim`. Absent ⇒ same as `dim`.
  displayDim?: 1 | 2 | 3
  // For a baked custom map (ADR-0007): how many points the frozen array holds.
  // A freshly selected custom map defaults the modeled count to this so it reads
  // correctly out of the gate — it stays a free knob, so changing it surfaces the
  // count/map drift. Absent for live-regenerating stock maps.
  bakedCount?: number
  // The map's integer `cols×rows(×depth)` grid at a modeled count (ADR-0009/0010),
  // or null when it has no clean lattice (an irregular cloud, a 3D map). A stock
  // grid generator derives its dims live from the count (Square squares up, Wide
  // runs 2:1); a custom lattice returns its baked dims (recorded at bake), ignoring
  // the count. Callers (the layout readout, the cylinder wrap) read it without
  // branching on provenance — that switch used to live in `mapStore.mapGridDims`.
  gridDims(pixelCount: number): GridDims | null
  // Provenance-gated solidity eligibility (ADR-0011): the normal RECIPE the stock
  // catalogue vouches for a 3D shell (`face`/`star`/`centroid`). The preview derives
  // the per-point outward normal accordingly and offers the solidity slider; its
  // presence IS the eligibility gate (there is no separate flag). A hand-imported
  // sphere-shaped cloud carries no recipe and is never solid-able, even though the
  // identical centroid math would run. Preview-only — never written to a map record
  // nor sent to a controller.
  normals?: NormalRecipe
  // Stock maps store their generator params (re-derivable/editable). Handed the
  // modeled pixelCount; returns one MapPoint per index, 0 .. pixelCount-1.
  resolve(pixelCount: number): MapPoint[]
}
