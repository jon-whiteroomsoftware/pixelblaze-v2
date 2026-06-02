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
import type { MapPoint, PixelMap, NormalizeMode, NormalRecipe } from './maps'
import { cubePixelCount, squarePlaneDims, applyNormalizeMode } from './maps'
import {
  SHAPES,
  embedPositions,
  polePositions,
  poleNormals,
  defaultPoleCols,
} from './shapes'
import { cylinderSurfacePositions, cylinderSurfaceNormals } from './surfaces'
import { clampPixelCount, cubeSideForCount } from './camera'
import { centroidNormals, faceNormals } from './centroidNormals'
import { starShellNormals } from './maps/starGeometry'

// The map a NormalRecipe tag resolves to its derivation (ADR-0011/0012): the
// catalogue declares the recipe NAME; the resolver owns the function lookup, so
// no map-id strings leak in here. A new shell ships its recipe in the catalogue.
const NORMAL_FNS: Record<NormalRecipe, (positions: [number, number, number][]) => [number, number, number][]> = {
  face: faceNormals,
  star: starShellNormals,
  centroid: centroidNormals,
}

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

// The single precedence chain for a layout's MODELED pixel count (ADR-0004), the
// pre-arrangement knob the user edits — before a map squares it up to a lattice
// (cube/plane) or a shape stretches it along a strip. A pattern's PERSISTED count
// wins; else a demo's RECOMMENDED count; else a custom map's BAKED length (the
// count its frozen array was authored at); else the per-dimension default. Stock
// generators carry no `baked`, so that slot drops out for them. The resolver feeds
// every map branch through this, and the deck's count box reads the same selector
// so the editable number matches what is rendered.
export function effectivePixelCount(opts: {
  persisted: number | null
  recommended?: number
  baked?: number
  fallback: number
}): number {
  return opts.persisted ?? opts.recommended ?? opts.baked ?? opts.fallback
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

// ---------------------------------------------------------------------------
// resolveLayout — the single seam from a Layout *selection* to its *resolved*
// drawn realization (ADR-0004/0005/0008/0009/0010/0011/0012).
//
// Given the persisted selection, the pattern's native dimensionality, the
// modeled pixel count and normalize mode, this corrects the selection (via
// resolveLayoutSelection), resolves the chosen map/shape/surface, applies the
// shared aspect normalization, computes draw positions + any solid-eligible
// surface normals, and reports the realized grid label. The component that
// consumes it is pure wiring: it writes correctedSelection back to the store,
// feeds `draw`/`mapPoints` to the renderer and render loop, and surfaces
// `displayDim`/`layoutLabel` to the editor store (solid-eligibility falls out as
// `draw.normals !== null`).
//
// Store-coupled lookups are INJECTED (`deps`) so this stays engine-pure (no
// store/React import, no import cycle) and table-testable with fakes: a test
// supplies a stub `resolveMap` returning a controlled PixelMap.

// The 3D channel carries per-point normals (present ⇔ solid-eligible, ADR-0011);
// the 2D channel never does. `displayDim` (1|2|3) is the LOGICAL display
// dimension for UI gating, distinct from the draw channel — a 1D line and a 2D
// ring both draw through the 2D channel.
export type ResolvedDraw =
  | { kind: '2d'; positions: [number, number][] }
  | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }

export interface ResolvedLayout {
  // The selection after dimension-correction — the component writes this back so
  // the dropdowns stay in sync with what was actually drawn.
  correctedSelection: LayoutSelection
  // Per-index sample+pos, feeding the shim and render loop.
  mapPoints: MapPoint[]
  pixelCount: number
  displayDim: 1 | 2 | 3
  // The `cols×rows(×depth)` readout, or null for a 1D strip / irregular cloud.
  layoutLabel: string | null
  draw: ResolvedDraw
}

export interface ResolveLayoutDeps {
  // Resolve a map id to its PixelMap (applies the store's DEFAULT_MAP_ID
  // fallback at the injection site so this module stays constant-free).
  resolveMap: (mapId: string | undefined) => PixelMap
  // Per-dimension default modeled count.
  defaultCountForDim: (dim: 1 | 2 | 3) => number
}

export interface ResolveLayoutInput {
  selection: LayoutSelection
  nativeDim: 1 | 2 | 3
  source: LayoutSource
  // The persisted modeled count (null ⇒ use a default / recommendation).
  persistedCount: number | null
  normalizeMode: NormalizeMode
  // IDE-side, preview-only on-open defaults for a demo (see demos.ts).
  recommendedMapId?: string
  recommendedCount?: number
  // The ephemeral pole-wrap density (null ⇒ the shape default).
  poleCols: number | null
  // The 1D-shape on-open count (DEFAULT_SHAPE_PIXEL_COUNT), injected to keep
  // this module free of store constants.
  shapeDefaultCount: number
}

export function resolveLayout(
  input: ResolveLayoutInput,
  deps: ResolveLayoutDeps,
): ResolvedLayout {
  const {
    selection,
    nativeDim,
    source,
    persistedCount,
    normalizeMode,
    recommendedMapId,
    recommendedCount,
    poleCols,
    shapeDefaultCount,
  } = input
  const { resolveMap, defaultCountForDim } = deps

  const correctedSelection = resolveLayoutSelection(
    selection,
    nativeDim,
    source,
    recommendedMapId,
  )

  let pixelCount: number
  let mapPoints: MapPoint[]
  let displayDim: 1 | 2 | 3
  let layoutLabel: string | null = null
  let positions2D: [number, number][] | null = null
  let positions3D: [number, number, number][] | null = null
  let normals3D: [number, number, number][] | null = null

  if (correctedSelection.shapeId) {
    // 1D shape: pos-only embedding over an empty sample.
    const shape = SHAPES[correctedSelection.shapeId as ShapeId]
    pixelCount = clampPixelCount(
      effectivePixelCount({ persisted: persistedCount, fallback: shapeDefaultCount }),
    )
    if (shape.displayDim === 3) {
      // Pole: a 1D strip wrapped onto a cylinder, drawn in 3D.
      const cols = poleCols ?? defaultPoleCols(pixelCount)
      positions3D = polePositions(pixelCount, cols)
      normals3D = poleNormals(pixelCount, cols)
      mapPoints = positions3D.map((pos) => ({ sample: [], pos }))
      displayDim = 3
    } else {
      positions2D = embedPositions(shape, pixelCount)
      mapPoints = positions2D.map((pos) => ({ sample: [], pos }))
      displayDim = shape.displayDim
    }
  } else {
    const map = resolveMap(correctedSelection.mapId)
    // The shared modeled count for every map branch (ADR-0004): a stock generator
    // carries no `baked`, so that slot drops out; the cube then squares this up.
    const modeledCount = effectivePixelCount({
      persisted: persistedCount,
      recommended: recommendedCount,
      baked: map.bakedCount,
      fallback: defaultCountForDim(map.dim),
    })
    if (map.dim === 3) {
      if (map.id === 'cube') {
        // 3D cube lattice: the count squares up to a side³ lattice (ADR-0004/0008).
        const cubeSide = cubeSideForCount(modeledCount)
        pixelCount = clampPixelCount(cubePixelCount(cubeSide))
        mapPoints = applyNormalizeMode(map.resolve(pixelCount), normalizeMode)
        layoutLabel = `${cubeSide}×${cubeSide}×${cubeSide}`
      } else {
        // 3D point cloud: stock regenerates live; a custom replays its baked
        // array index-aligned to the count (ADR-0007/0008).
        pixelCount = clampPixelCount(modeledCount)
        mapPoints = applyNormalizeMode(map.resolve(pixelCount), normalizeMode)
      }
      positions3D = mapPoints.map((p) => p.pos as [number, number, number])
      // A solid-eligible stock 3D map (ADR-0011/0012) carries no baked normal, so
      // the preview re-derives one per the map's declared recipe — the faceted Cube
      // shell uses per-face normals, the Star shell its stellation faces, a convex
      // shell the generic centroid radial. No recipe ⇒ not solid-eligible.
      if (map.normals) {
        normals3D = NORMAL_FNS[map.normals](positions3D)
      }
      displayDim = 3
    } else if (map.id !== 'plane') {
      // 2D point cloud: irregular positions drawn through the 2D pos channel.
      pixelCount = clampPixelCount(modeledCount)
      mapPoints = applyNormalizeMode(map.resolve(pixelCount), normalizeMode)
      positions2D = mapPoints.map((p) => p.pos as [number, number])
      displayDim = 2
    } else {
      // 2D stock plane: the count squares up to the most-square grid (ADR-0004/0009).
      pixelCount = clampPixelCount(modeledCount)
      const planeDims = squarePlaneDims(pixelCount)
      mapPoints = applyNormalizeMode(map.resolve(pixelCount), normalizeMode)
      positions2D = mapPoints.map((p) => p.pos as [number, number])
      layoutLabel = `${planeDims.cols}×${planeDims.rows}`
      displayDim = 2
    }

    // 2D surface embedding (ADR-0010): the Cylinder wraps the map's grid onto a
    // 3D tube. The map still owns `sample`; the surface owns `pos`.
    if (correctedSelection.surfaceId === 'cylinder' && displayDim === 2) {
      const gridDims = map.gridDims(pixelCount)
      if (gridDims) {
        positions3D = cylinderSurfacePositions(pixelCount, gridDims)
        normals3D = cylinderSurfaceNormals(pixelCount, gridDims)
        mapPoints = mapPoints.map((p, i) => ({ sample: p.sample, pos: positions3D![i] }))
        positions2D = null
        layoutLabel = `${gridDims.cols}×${gridDims.rows}`
        displayDim = 3
      }
    }
  }

  const draw: ResolvedDraw =
    positions3D !== null
      ? { kind: '3d', positions: positions3D, normals: normals3D }
      : { kind: '2d', positions: positions2D ?? [] }

  return { correctedSelection, mapPoints, pixelCount, displayDim, layoutLabel, draw }
}
