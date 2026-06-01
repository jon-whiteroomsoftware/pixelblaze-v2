// The Layout controls' routing logic (ADR-0005/ADR-0010) — pure, no React/DOM.
//
// Layout is two orthogonal controls, not one union dropdown:
//   • the MAP control owns `sample` (the [u,v] the pattern reads), and
//   • the EMBEDDING control owns `pos` (where each dot is drawn) — populated
//     with viewport *shapes* for a 1D pattern and *surfaces* for a 2D pattern.
// Controls show only when they carry a real choice: 1D → embedding (shapes)
// only; 2D with a wrappable map → both (map left, surface right); 2D with an
// irregular map, or 3D → map only.
//
// This module owns (a) the sample-arity filter deciding which maps a pattern can
// consume, (b) the embedding list for a given pattern + active map, (c) routing
// a chosen option to the right knob, and (d) resolving a pattern's persisted
// selection (or a default) on open. The components are thin wrappers over these.

import type { ShapeId } from './shapes'
import type { SurfaceId } from './surfaces'

export type LayoutKind = 'shape' | 'surface' | 'map'

export interface LayoutOption {
  kind: LayoutKind
  id: string // ShapeId / SurfaceId for embeddings, map id for maps
  name: string
  // DISPLAY dimension of the option (a 1D pattern's ring reads as 2D display; a
  // 2D pattern's cylinder reads as 3D).
  displayDim: 1 | 2 | 3
}

export interface ShapeMeta {
  id: ShapeId
  name: string
  displayDim: 1 | 2 | 3
}

export interface SurfaceMeta {
  id: SurfaceId
  name: string
  displayDim: 2 | 3
  // Whether this surface requires a map's integer grid (cylinder yes, flat no).
  needsGrid: boolean
}

export interface MapMeta {
  id: string
  name: string
  // Sample arity — what the selector filters on (a `dim:2` map is offered to
  // render2D patterns).
  dim: 1 | 2 | 3
  // How the map is DRAWN, when it differs from `dim`. Absent ⇒ same as `dim`.
  displayDim?: 1 | 2 | 3
  // Whether the map exposes a clean integer `cols×rows` grid a surface can wrap
  // (ADR-0010). The stock Square/Wide and regular-lattice custom maps qualify;
  // an irregular cloud does not, so it is offered Flat only.
  wrappable?: boolean
}

export interface LayoutSource {
  shapes: ShapeMeta[]
  surfaces: SurfaceMeta[]
  maps: MapMeta[]
}

// The maps a pattern of native dimension `nativeDim` can consume, filtered by
// `sample`-arity: a map emits a sample of its own `dim`, so it is offered only
// when its `dim` matches the pattern's native dimension. (A 1D pattern reads no
// map — it always uses a viewport shape — so this is empty for nativeDim 1.)
export function mapOptions(nativeDim: 1 | 2 | 3, source: LayoutSource): LayoutOption[] {
  if (nativeDim === 1) return []
  return source.maps
    .filter((m) => m.dim === nativeDim)
    .map((m) => ({ kind: 'map' as const, id: m.id, name: m.name, displayDim: m.displayDim ?? m.dim }))
}

// The embedding options for a pattern + its active map: shapes for a 1D pattern
// (every shape — they all dispatch the 1D `render` over an empty sample), and
// surfaces for a 2D pattern. Surfaces that need a grid (cylinder) are offered
// only when the active map is wrappable; an irregular 2D map gets Flat alone —
// and a single-option embedding control is hidden by the component (consistent
// with "show only when it carries a real choice"). A 3D pattern has no embedding
// choice (it draws through the map's own 3D positions).
export function embeddingOptions(
  nativeDim: 1 | 2 | 3,
  source: LayoutSource,
  activeMap?: MapMeta,
): LayoutOption[] {
  if (nativeDim === 1) {
    return source.shapes.map((s) => ({
      kind: 'shape' as const,
      id: s.id,
      name: s.name,
      displayDim: s.displayDim,
    }))
  }
  if (nativeDim === 3) return []
  const wrappable = activeMap?.wrappable ?? false
  return source.surfaces
    .filter((s) => wrappable || !s.needsGrid)
    .map((s) => ({ kind: 'surface' as const, id: s.id, name: s.name, displayDim: s.displayDim }))
}

// The per-pattern layout selection persisted on `PatternRecord` (ADR-0004/0005/0010).
export interface LayoutSelection {
  mapId?: string
  shapeId?: string
  surfaceId?: SurfaceId
}

// Route a chosen option to the knob it sets: shapes → `shapeId`, surfaces →
// `surfaceId`, maps → `mapId`.
export function selectionForOption(opt: LayoutOption): LayoutSelection {
  if (opt.kind === 'shape') return { shapeId: opt.id }
  if (opt.kind === 'surface') return { surfaceId: opt.id as SurfaceId }
  return { mapId: opt.id }
}

// The id the MAP control shows as selected: the pattern's `mapId` for 2D/3D,
// nothing for 1D (which has no map control).
export function selectedMapId(sel: LayoutSelection, nativeDim: 1 | 2 | 3): string | undefined {
  return nativeDim === 1 ? undefined : sel.mapId
}

// The id the EMBEDDING control shows as selected: a 1D pattern reads its
// `shapeId`; a 2D pattern its `surfaceId` (defaulting to Flat). 3D has none.
export function selectedEmbeddingId(
  sel: LayoutSelection,
  nativeDim: 1 | 2 | 3,
): string | undefined {
  if (nativeDim === 1) return sel.shapeId
  if (nativeDim === 2) return sel.surfaceId ?? 'flat'
  return undefined
}

// Resolve the on-open solidity for a layout (ADR-0011), the same precedence
// family as the recommended map/count: a user pattern's PERSISTED solidity wins
// outright; otherwise a demo's RECOMMENDED solidity is the on-open default ahead
// of the global `fallback` (1.0). A demo persists nothing, so the recommendation
// only sets the starting point — the slider stays freely editable afterwards.
export function resolveSolidity(
  persisted: number | undefined,
  recommended: number | undefined,
  fallback: number,
): number {
  return persisted ?? recommended ?? fallback
}

// Resolve the layout a pattern opens with, validating its persisted selection
// against the pattern's native dimensionality and the live catalogue:
//   • the MAP is the persisted `mapId` if still a valid dim-matched option, else
//     the first map (2D/3D); a 1D pattern keeps no map.
//   • the EMBEDDING is the persisted `shapeId` (1D) / `surfaceId` (2D) if still
//     offered, else the first/default — Flat for 2D, the first shape for 1D.
// A stale cylinder on a now-irregular map falls back to Flat (cylinder drops out
// of the offered set), so selecting a wrappable map never surprise-wraps.
//
// `recommendedMapId` is an IDE-side, preview-only default supplied by a
// geometry-aware demo (see demos.ts): when a pattern carries NO persisted map it
// overrides the bare first-match default, so the demo opens on the map it was
// built for. It is ignored the moment a pattern persists its own `mapId`, and is
// honoured only when it is still a valid dim-matched option.
export function resolveLayoutSelection(
  persisted: LayoutSelection,
  nativeDim: 1 | 2 | 3,
  source: LayoutSource,
  recommendedMapId?: string,
): LayoutSelection {
  const sel: LayoutSelection = {}

  if (nativeDim !== 1) {
    const maps = mapOptions(nativeDim, source)
    // A valid persisted map wins outright. Otherwise the recommendation (if a
    // valid dim-matched option) is the default, ahead of the bare first match.
    const recommended = maps.find((m) => m.id === recommendedMapId)
    const map = maps.find((m) => m.id === persisted.mapId) ?? recommended ?? maps[0]
    if (map) sel.mapId = map.id
  }

  const activeMap = sel.mapId ? source.maps.find((m) => m.id === sel.mapId) : undefined
  const embeddings = embeddingOptions(nativeDim, source, activeMap)
  if (embeddings.length > 0) {
    const wantId = selectedEmbeddingId(persisted, nativeDim)
    const chosen = embeddings.find((e) => e.id === wantId) ?? embeddings[0]
    Object.assign(sel, selectionForOption(chosen))
  } else if (nativeDim === 2) {
    // Irregular 2D map: no embedding choice, but the layout is still Flat.
    sel.surfaceId = 'flat'
  }

  return sel
}
