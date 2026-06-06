import { useMapStore, layoutSource } from '@/store/mapStore'
import { useEditorStore } from '@/store/editorStore'
import { writeCascadedOverride } from '@/store/settingsCascade'
import {
  mapOptions,
  embeddingOptions,
  selectionForOption,
  selectedMapId,
  selectedEmbeddingId,
} from '@/engine/layout'
import type { ShapeId } from '@/engine/shapes'
import type { SurfaceId } from '@/engine/surfaces'
import { DeckSelect } from '@/components/DeckSelect'

// The Layout controls (ADR-0010): two orthogonal knobs over the layout's two
// code owners — a MAP control (owns `sample`) and an EMBEDDING control (owns
// `pos`, populated with shapes for 1D and surfaces for 2D). Issue #253 splits the
// two across the deck so the real-vs-viewport boundary reads structurally: the
// MAP control is real Pixelblaze state and lives in the PIXELBLAZE block of the
// preview deck (next to pixel count / fit / brightness), while the EMBEDDING
// control is a pure viewport affordance and stays in the play-button row. The two
// share the same pure `@/engine/layout` routing/filter helpers via the hook below;
// each exported component is a thin wrapper that reads state and dispatches.

// Shared layout-control state + routing for the two split controls. Reads the live
// stores, resolves the available map/embedding options through the pure engine
// helpers, and exposes a single `route` that dispatches a chosen option to its
// setter and persists it as a per-pattern cascaded override (ADR-0013).
function useLayoutControls() {
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activeSurfaceId = useMapStore((s) => s.activeSurfaceId)
  const userMaps = useMapStore((s) => s.userMaps)
  const setActiveMap = useMapStore((s) => s.setActiveMap)
  const setActiveShape = useMapStore((s) => s.setActiveShape)
  const setActiveSurface = useMapStore((s) => s.setActiveSurface)

  const source = layoutSource({ userMaps })
  const maps = mapOptions(nativeDim, source)
  const activeMap = source.maps.find((m) => m.id === activeMapId)
  const embeddings = embeddingOptions(nativeDim, source, activeMap)

  const sel = { mapId: activeMapId, shapeId: activeShapeId, surfaceId: activeSurfaceId }
  const mapValue = selectedMapId(sel, nativeDim)
  const embeddingValue = selectedEmbeddingId(sel, nativeDim)

  // Route a chosen option to its live setter AND write a per-pattern cascaded
  // override (ADR-0013): a map/shape/surface change is genuine manipulation, so it
  // persists on the active pattern (no-op for a read-only demo).
  function route(id: string, options: ReturnType<typeof mapOptions>) {
    const opt = options.find((o) => o.id === id)
    if (!opt) return
    const next = selectionForOption(opt)
    if (next.mapId) {
      setActiveMap(next.mapId)
      writeCascadedOverride('mapId', next.mapId)
    }
    if (next.shapeId) {
      setActiveShape(next.shapeId as ShapeId)
      writeCascadedOverride('shapeId', next.shapeId)
    }
    if (next.surfaceId) {
      setActiveSurface(next.surfaceId as SurfaceId)
      writeCascadedOverride('surfaceId', next.surfaceId)
    }
  }

  return { nativeDim, maps, embeddings, mapValue, embeddingValue, route }
}

// The MAP control (#253): real Pixelblaze state, rendered bare so the PIXELBLAZE
// block can wrap it in a labeled deck cell paired with `fit`. Renders nothing for
// a mapless layout (1D, or a dimension with no maps) — the caller hides the whole
// map+fit row in that case.
export function MapSelect() {
  const { maps, mapValue, route } = useLayoutControls()
  if (maps.length === 0) return null
  return (
    <DeckSelect
      ariaLabel="Map"
      value={mapValue ?? maps[0].id}
      options={maps.map((o) => ({ value: o.id, label: o.name }))}
      onChange={(id) => route(id, maps)}
      menuWidthClass="w-44"
    />
  )
}

// The EMBEDDING control (#253): a pure viewport affordance — shapes for 1D, surfaces
// for 2D — that stays in the play-button row. Shows only when it carries a real
// choice: a single option (an irregular cloud's Flat-only set, or 3D with none) is
// not a choice, so it is hidden (ADR-0010, "show only when needed").
export function EmbeddingSelect() {
  const { nativeDim, embeddings, embeddingValue, route } = useLayoutControls()
  const showEmbedding = embeddings.length > 1
  if (!showEmbedding) return null
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <DeckSelect
        ariaLabel={nativeDim === 1 ? 'Shape' : 'Surface'}
        value={embeddingValue ?? embeddings[0].id}
        options={embeddings.map((o) => ({
          value: o.id,
          label: o.name,
        }))}
        onChange={(id) => route(id, embeddings)}
        menuWidthClass="w-28"
      />
    </div>
  )
}
