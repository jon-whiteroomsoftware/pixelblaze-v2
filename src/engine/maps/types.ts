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

export interface PixelMap {
  id: string
  name: string
  builtin: boolean
  // DISPLAY dimensionality (not coord-arg count). Names the render fn used for
  // default selection on open.
  dim: 1 | 2 | 3
  // Stock maps store their generator params (re-derivable/editable). Handed the
  // modeled pixelCount; returns one MapPoint per index, 0 .. pixelCount-1.
  resolve(pixelCount: number): MapPoint[]
}
