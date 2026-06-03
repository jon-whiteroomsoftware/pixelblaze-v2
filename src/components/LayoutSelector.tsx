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
// `pos`, populated with shapes for 1D and surfaces for 2D). Each shows only when
// it carries a real choice: 1D → embedding only; 2D with a wrappable map → both
// (map left, surface right); 3D → map only. All routing/filter logic is the pure
// `@/engine/layout` helpers; this is a thin wrapper that reads state, dispatches,
// and lays the two DeckSelects out side by side so they read like the rest of
// the deck.
export function LayoutSelector() {
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

  // The embedding control shows only when it carries a real choice: a single
  // option (an irregular cloud's Flat-only set) is not a choice, so it is hidden
  // and the Map control stands alone (ADR-0010, "show only when needed").
  const showEmbedding = embeddings.length > 1

  if (maps.length === 0 && !showEmbedding) return null

  return (
    <div className="flex items-center gap-1.5">
      {maps.length > 0 && (
        <DeckSelect
          ariaLabel="Map"
          value={mapValue ?? maps[0].id}
          options={maps.map((o) => ({ value: o.id, label: o.name }))}
          onChange={(id) => route(id, maps)}
          menuWidthClass="w-44"
        />
      )}
      {showEmbedding && (
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
      )}
    </div>
  )
}
