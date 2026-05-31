import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useEditorStore } from '@/store/editorStore'
import { useMapStore } from '@/store/mapStore'
import { mapTemplates, isPristineToBaseline, type MapTemplate } from '@/engine/maps'

// The editor header strip in map mode (#151): the map's name, a parse-only
// compile badge, and the "Load template" dropdown. The dropdown is the ONLY way
// to view a stock map's source — selecting one replaces the buffer with its
// verbatim source (text only, not name/dim), guarded so an edited buffer is not
// clobbered without confirmation.
export function MapModeHeader() {
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const mapBaseline = useMapStore((s) => s.mapBaseline)
  const loadMapTemplate = useMapStore((s) => s.loadMapTemplate)
  const source = useEditorStore((s) => s.source)

  // Pending template awaiting overwrite confirmation (buffer was edited).
  const [pending, setPending] = useState<MapTemplate | null>(null)

  const name =
    editingMap?.kind === 'existing'
      ? (userMaps.find((m) => m.id === editingMap.id)?.name ?? 'Map')
      : 'Map'

  function chooseTemplate(t: MapTemplate) {
    // Dirty-guard: silent swap while the buffer is byte-identical to the last
    // loaded baseline (skeleton or a prior template); otherwise confirm first.
    if (isPristineToBaseline(source, mapBaseline)) {
      loadMapTemplate(t.source)
    } else {
      setPending(t)
    }
  }

  function confirmOverwrite() {
    if (pending) loadMapTemplate(pending.source)
    setPending(null)
  }

  return (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="truncate">{name}</span>
        <CompileStatusBadge />
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
          map
        </span>
      </span>
      <LoadTemplateMenu onSelect={chooseTemplate} />

      <AlertDialogRoot open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null) }}>
        <AlertDialogContent>
          <AlertDialogTitle>Replace map source?</AlertDialogTitle>
          <AlertDialogDescription>
            Loading "{pending?.name}" will replace your edited source. This can't be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOverwrite}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </>
  )
}

// A small action dropdown listing the source-backed stock maps. Unlike a select
// it has no persistent "current value" — each pick fires onSelect — so it shows a
// fixed "Load template" label.
function LoadTemplateMenu({ onSelect }: { onSelect: (t: MapTemplate) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const templates = mapTemplates()

  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-0.5 h-6 pl-2 pr-1 rounded border border-zinc-700 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-amber-400/80 transition-colors"
      >
        <span className="whitespace-nowrap">Load template</span>
        <ChevronDown size={12} className="shrink-0 text-zinc-500" />
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-label="Load template"
          className="absolute top-full right-0 mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 py-1"
        >
          {templates.map((t) => (
            <button
              key={t.id}
              role="option"
              aria-selected={false}
              onClick={() => { onSelect(t); setIsOpen(false) }}
              className="w-full text-left px-3 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-amber-400/80"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
