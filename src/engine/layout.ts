// The "Shape" dropdown's routing logic (ADR-0005) — pure, no React/DOM.
//
// One control blurs two code owners: a 1D pattern picks a viewport *shape*
// embedding (`shapeId`), a 2D/3D pattern picks a *map* (`mapId`). This module
// owns (a) the sample-arity filter that decides which layouts a pattern can
// consume, (b) routing a chosen option back to the right knob, and (c) resolving
// a pattern's persisted selection (or a default) on open. The component is a
// thin wrapper over these functions.

import type { ShapeId } from './shapes'

export type LayoutKind = 'shape' | 'map'

export interface LayoutOption {
  kind: LayoutKind
  id: string // ShapeId for shapes, map id for maps
  name: string
  // DISPLAY dimension of the option (a 1D pattern's ring reads as 2D display).
  displayDim: 1 | 2 | 3
}

export interface ShapeMeta {
  id: ShapeId
  name: string
  displayDim: 1 | 2 | 3
}

export interface MapMeta {
  id: string
  name: string
  // Sample arity — what the selector filters on (a `dim:2` map is offered to
  // render2D patterns).
  dim: 1 | 2 | 3
  // How the map is DRAWN, when it differs from `dim` (e.g. a cylinder is a
  // `dim:2` sample drawn in 3D). Drives the dimension badge. Absent ⇒ same as `dim`.
  displayDim?: 1 | 2 | 3
}

export interface LayoutSource {
  shapes: ShapeMeta[]
  maps: MapMeta[]
}

// Which layouts a pattern of native dimension `nativeDim` can consume, filtered
// by `sample`-arity (pattern compatibility). A pattern consumes a `nativeDim`-arg
// `sample`:
//   • Viewport shapes always emit an EMPTY sample (1D dispatch), so every shape
//     is offered to a 1D pattern — regardless of the shape's display dimension
//     (line/ring/helix all dispatch the 1D `render`).
//   • Maps emit a sample of their own `dim`, so a map is offered only when its
//     `dim` matches the pattern's native dimension.
export function layoutOptions(nativeDim: 1 | 2 | 3, source: LayoutSource): LayoutOption[] {
  const opts: LayoutOption[] = []
  if (nativeDim === 1) {
    for (const s of source.shapes) {
      opts.push({ kind: 'shape', id: s.id, name: s.name, displayDim: s.displayDim })
    }
  }
  for (const m of source.maps) {
    if (m.dim === nativeDim) {
      opts.push({ kind: 'map', id: m.id, name: m.name, displayDim: m.displayDim ?? m.dim })
    }
  }
  return opts
}

// The per-pattern layout selection persisted on `PatternRecord` (ADR-0004/0005).
export interface LayoutSelection {
  mapId?: string
  shapeId?: string
}

// Route a chosen option to the knob it sets: shapes → `shapeId`, maps → `mapId`.
export function selectionForOption(opt: LayoutOption): LayoutSelection {
  return opt.kind === 'shape' ? { shapeId: opt.id } : { mapId: opt.id }
}

// The option id the dropdown should show as selected: a 1D pattern reads its
// `shapeId`, a 2D/3D pattern its `mapId`.
export function selectedOptionId(
  sel: LayoutSelection,
  nativeDim: 1 | 2 | 3,
): string | undefined {
  return nativeDim === 1 ? sel.shapeId : sel.mapId
}

// Resolve the layout a pattern opens with: its persisted selection if that id is
// still a valid option for the pattern's native dimension, else the first option
// (the default for that dimension — line for 1D, plane for 2D). Returns `{}` only
// when no option exists at all (no shapes/maps available).
export function resolveLayoutSelection(
  persisted: LayoutSelection,
  nativeDim: 1 | 2 | 3,
  source: LayoutSource,
): LayoutSelection {
  const opts = layoutOptions(nativeDim, source)
  const wantId = selectedOptionId(persisted, nativeDim)
  const match = opts.find((o) => o.id === wantId)
  const chosen = match ?? opts[0]
  return chosen ? selectionForOption(chosen) : {}
}
