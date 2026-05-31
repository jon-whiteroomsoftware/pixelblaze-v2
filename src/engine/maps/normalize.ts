// The shared map normalize pass (ADR-0008). Stock map sources return RAW
// natural-unit geometry (row/col indices, lattice indices, raw cos/sin in
// [-1,1]); this single engine pass maps each axis independently into [0,1],
// mirroring how firmware normalizes a map's coordinates at bake time. This
// replaces the per-map hand-baked `i/(n-1)` that each TS generator used to do.
//
// Per-axis (not aspect-preserving) is the retained behaviour (open question #116
// lives here, unchanged): every axis is stretched to fill [0,1] by its own
// min/max. A degenerate axis (all values equal, range 0) collapses to 0 — the
// plane's legacy single-cell-axis convention, which keeps the 2D no-regression
// baseline byte-stable.

// Normalize a raw coordinate array per-axis into [0,1]. All coords must share the
// same arity (the caller's source is responsible for that). Returns a fresh
// array; the input is not mutated.
export function normalizePerAxis(coords: number[][]): number[][] {
  if (coords.length === 0) return []
  const arity = coords[0].length
  const min = new Array<number>(arity).fill(Infinity)
  const max = new Array<number>(arity).fill(-Infinity)
  for (const c of coords) {
    for (let a = 0; a < arity; a++) {
      if (c[a] < min[a]) min[a] = c[a]
      if (c[a] > max[a]) max[a] = c[a]
    }
  }
  const range = min.map((mn, a) => max[a] - mn)
  return coords.map((c) =>
    c.map((v, a) => (range[a] > 0 ? (v - min[a]) / range[a] : 0)),
  )
}
