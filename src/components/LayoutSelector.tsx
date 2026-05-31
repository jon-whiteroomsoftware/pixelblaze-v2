import { useMapStore, layoutSource } from '@/store/mapStore'
import { useEditorStore } from '@/store/editorStore'
import { layoutOptions, selectionForOption, selectedOptionId } from '@/engine/layout'
import type { ShapeId } from '@/engine/shapes'
import { DeckSelect } from '@/components/DeckSelect'

// The "Layout" dropdown (ADR-0005): one knob over two code owners. It lists the
// layouts the active pattern can consume — filtered by `sample`-arity — and
// routes the choice to the right store (1D shapes → shapeId, 2D/3D maps → mapId).
// All routing/filter logic is the pure `@/engine/layout` helpers; this is a thin
// wrapper that reads state and dispatches, rendered with the shared DeckSelect so
// it reads identically to the renderer and speed controls.
export function LayoutSelector() {
  const nativeDim = useEditorStore((s) => s.nativeDim)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const userMaps = useMapStore((s) => s.userMaps)
  const setActiveMap = useMapStore((s) => s.setActiveMap)
  const setActiveShape = useMapStore((s) => s.setActiveShape)

  const options = layoutOptions(nativeDim, layoutSource({ userMaps }))
  const currentId = selectedOptionId({ mapId: activeMapId, shapeId: activeShapeId }, nativeDim)
  if (options.length === 0) return null

  function choose(id: string) {
    const opt = options.find((o) => o.id === id)
    if (!opt) return
    const sel = selectionForOption(opt)
    if (sel.shapeId) setActiveShape(sel.shapeId as ShapeId)
    if (sel.mapId) setActiveMap(sel.mapId)
  }

  return (
    <DeckSelect
      ariaLabel="Layout"
      value={currentId ?? options[0].id}
      options={options.map((o) => ({ value: o.id, label: o.name, badge: `${o.displayDim}D` }))}
      onChange={choose}
      menuWidthClass="w-28"
    />
  )
}
