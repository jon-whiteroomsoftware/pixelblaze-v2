import { useState, useRef, useEffect } from 'react'
import { useMapStore, layoutSource } from '@/store/mapStore'
import { useEditorStore } from '@/store/editorStore'
import {
  layoutOptions,
  selectionForOption,
  selectedOptionId,
  type LayoutOption,
} from '@/engine/layout'
import type { ShapeId } from '@/engine/shapes'

// The "Shape" dropdown (ADR-0005): one knob over two code owners. It lists the
// layouts the active pattern can consume — filtered by `sample`-arity — and
// routes the choice to the right store (1D shapes → shapeId, 2D/3D maps → mapId).
// All routing/filter logic is the pure `@/engine/layout` helpers; this is a thin
// wrapper that reads state and dispatches.
export function ShapeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const nativeDim = useEditorStore((s) => s.nativeDim)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const userMaps = useMapStore((s) => s.userMaps)
  const setActiveMap = useMapStore((s) => s.setActiveMap)
  const setActiveShape = useMapStore((s) => s.setActiveShape)

  const options = layoutOptions(nativeDim, layoutSource({ userMaps }))
  const currentId = selectedOptionId({ mapId: activeMapId, shapeId: activeShapeId }, nativeDim)
  const current = options.find((o) => o.id === currentId) ?? options[0]

  function choose(opt: LayoutOption) {
    const sel = selectionForOption(opt)
    if (sel.shapeId) setActiveShape(sel.shapeId as ShapeId)
    if (sel.mapId) setActiveMap(sel.mapId)
    setIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  if (options.length === 0) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Shape"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center h-6 px-1.5 rounded text-xs font-mono text-zinc-400 hover:text-amber-400/70 hover:bg-zinc-700 transition-colors"
      >
        {current?.name ?? 'Shape'}
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Shape"
          className="absolute top-full right-0 mt-1 w-28 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 py-1 font-mono"
        >
          {options.map((opt) => (
            <button
              key={`${opt.kind}:${opt.id}`}
              role="option"
              aria-selected={opt.id === current?.id}
              onClick={() => choose(opt)}
              className={`block w-full text-left px-3 py-1 text-xs transition-colors hover:bg-zinc-800 ${
                opt.id === current?.id ? 'text-amber-400' : 'text-zinc-300'
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
