import type { MapPoint } from './types'

// The shared map normalize pass (ADR-0008, ADR-0009). Stock map sources return
// RAW natural-unit geometry (row/col indices, lattice indices, raw cos/sin in
// [-1,1]); this single engine pass maps that geometry into [0,1], mirroring how
// firmware normalizes a map's coordinates at bake time. This replaces the per-map
// hand-baked `i/(n-1)` that each TS generator used to do.
//
// Normalization is ASPECT-PRESERVING, anchored to the longest axis (ADR-0009):
// every axis is divided by the SINGLE largest axis range, so the longest axis
// fills [0,1] and shorter axes get a proportionally smaller range (a 15×10 map →
// long axis 0..1, short axis 0..0.667). No axis ever exceeds 1.0. This supersedes
// the old per-axis stretch (each axis independently → [0,1]), a vestige of the
// square-only 2D renderer that collapsed 15×10, 10×15, and 12×12 maps all to the
// same unit square — destroying the map's true shape on both the drawn `pos` and
// the pattern's `sample`. The map is authoritative for aspect (ADR-0009); the
// preview and the pattern both see the true proportion.
//
// A fully degenerate input (all points coincident, longest range 0) collapses to
// the origin — the single-point / single-cell convention.
//
// The Mapper's Fill mode (#174) is the per-axis counterpart: each axis normalizes
// INDEPENDENTLY to [0,1] (per-axis stretch), so a 4:1 raw map fills the unit
// square — the pre-#116 behavior. Both modes are real, faithful hardware (Mapper
// Fill/Contain dropdown); the active mode is a per-map user choice. `normalizeFill`
// is idempotent on Contain-normalized points (Contain leaves min=0 per axis, so a
// per-axis renormalize just rescales each axis's max to 1 — the same result as
// applying Fill to the raw coords), so it doubles as a post-pass that turns
// already-baked Contain points into Fill without re-running the source.

// Mapper map-coordinate normalization mode (#174). Contain (default) preserves
// aspect (longest axis anchors); Fill stretches each axis independently to [0,1].
export type NormalizeMode = 'contain' | 'fill'

// Re-normalize resolved map points to the given mode (#174). Contain is the baked/
// resolved default (every map already emits Contain coords), so it's a pass-through;
// Fill re-stretches each axis to [0,1] using normalizeFill — valid as a live post-
// pass precisely because it's idempotent-equivalent on Contain output. Applied at
// resolve time, before any embedding/surface overwrites `pos`, so `sample` (the map
// coords the pattern reads) and the flat `pos` both reflect the chosen mode. At
// resolve `sample` and `pos` coincide, so a single per-axis pass drives both.
export function applyNormalizeMode(points: MapPoint[], mode: NormalizeMode): MapPoint[] {
  if (mode === 'contain' || points.length === 0) return points
  // Callers pass map-resolved points, whose `pos` is always defined (a 1D shape's
  // pos-less points never reach here — Fill only applies to map coordinates).
  const filled = normalizeFill(points.map((p) => p.pos as number[]))
  return filled.map((c) => ({
    sample: [...c],
    pos: [...c] as MapPoint['pos'],
  }))
}

// Normalize a raw coordinate array, aspect-preserving, into [0,1] (longest axis
// fills the unit interval). All coords must share the same arity (the caller's
// source is responsible for that). Returns a fresh array; input is not mutated.
export function normalizeAspect(coords: number[][]): number[][] {
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
  // Divide every axis by the single longest range so aspect is preserved; the
  // longest axis maps to [0,1], shorter axes to [0, range_a / longest].
  const longest = Math.max(...min.map((mn, a) => max[a] - mn))
  return coords.map((c) =>
    c.map((v, a) => (longest > 0 ? (v - min[a]) / longest : 0)),
  )
}

// Normalize a raw coordinate array per-axis (Mapper Fill, #174): each axis is
// independently mapped to [0,1] (subtract that axis's min, divide by its own
// range), so the map stretches to fill the unit square regardless of aspect. A
// degenerate (constant) axis collapses to 0. Returns a fresh array; input is not
// mutated. Idempotent-equivalent on Contain output (see header): applying this to
// already-Contain-normalized points yields the same Fill result as applying it to
// the raw coords, so it serves as a live post-pass on baked/resolved Contain maps.
export function normalizeFill(coords: number[][]): number[][] {
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
  return coords.map((c) =>
    c.map((v, a) => {
      const range = max[a] - min[a]
      return range > 0 ? (v - min[a]) / range : 0
    }),
  )
}
