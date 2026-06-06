import { useEffect, useRef, useState } from 'react'
import { Library, ChevronDown } from 'lucide-react'
import { LIBRARIES } from '@/pixelblaze/libs'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { LibraryHoverCard } from '@/components/LibraryHoverCard'

// The Libraries affordance in the header's LEFT zone (#254). Libraries are reference
// documentation consulted while writing pattern code, not browsable patterns — they
// don't belong in the pattern rail (especially once it grew a dimension lens + name
// search, both meaningless for dimensionless libraries). They live here, beside the
// PXLBLZ wordmark, under the header's spatial grammar: left = identity + authoring
// reference, right = hardware/preview (Connect to Controller).
//
// The button mirrors the ControllerBar pill family (bordered h-6, glyph + label,
// dropdown below, click-away dismiss) so the two header zones read as one system.
// "PixelBlaze" is the built-in reference (a cheatsheet only) — hovering it shows the
// built-ins flyout but there is no source to open; the library files below it open
// their source read-only in the editor on click, and reveal their API reference on
// hover (the same LibraryHoverCard the rail used to drive).

const LIBRARY_NAMES = Object.keys(LIBRARIES).sort()

export function LibrariesMenu() {
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const setActiveLibrary = usePatternStore((s) => s.setActiveLibrary)
  const closeMapEditor = useMapStore((s) => s.closeMapEditor)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Hover-flyout machinery (relocated verbatim from the rail): a short open delay so
  // sweeping the cursor down the list doesn't flash every card, and a brief close
  // grace so the pointer can travel from a row onto the card without it vanishing.
  const [hoveredLib, setHoveredLib] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const hoveredLibRef = useRef<string | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // Close the dropdown (and any open flyout) on an outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHoveredLib(null)
        hoveredLibRef.current = null
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function startShow(name: string, el: HTMLElement) {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
    if (hoveredLibRef.current !== null) {
      setAnchorRect(el.getBoundingClientRect())
      setHoveredLib(name)
      hoveredLibRef.current = name
      return
    }
    showTimerRef.current = setTimeout(() => {
      setAnchorRect(el.getBoundingClientRect())
      setHoveredLib(name)
      hoveredLibRef.current = name
    }, 250)
  }

  function startHide() {
    if (showTimerRef.current) { clearTimeout(showTimerRef.current); showTimerRef.current = null }
    hideTimerRef.current = setTimeout(() => {
      setHoveredLib(null)
      hoveredLibRef.current = null
    }, 100)
  }

  function cancelHide() {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  function openLibrary(name: string) {
    closeMapEditor()
    setActiveLibrary(name)
    setSource(LIBRARIES[name])
    setIsReadOnly(true)
    setOpen(false)
    setHoveredLib(null)
    hoveredLibRef.current = null
  }

  const rowClass = (active: boolean) =>
    [
      'flex w-full items-center px-3 py-1 text-left text-xs font-mono select-none',
      active ? 'text-live bg-live/10' : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100',
    ].join(' ')

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        data-testid="libraries-menu-button"
        aria-label="Libraries"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v)
          setHoveredLib(null)
          hoveredLibRef.current = null
        }}
        className={`inline-flex items-center gap-1.5 h-6 rounded border px-2 font-mono text-xs transition-colors select-none focus:outline-none ${
          open
            ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <Library size={14} aria-hidden className="shrink-0 text-zinc-400" />
        Libraries
        <ChevronDown size={13} aria-hidden className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          data-testid="libraries-menu-dropdown"
          className="absolute left-0 top-8 z-50 w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-2xl"
        >
          {/* The built-in reference: hover for the flyout, but no source to open. */}
          <div
            data-testid="libraries-menu-item"
            onMouseEnter={(e) => startShow('PixelBlaze', e.currentTarget)}
            onMouseLeave={startHide}
            className="flex w-full items-center px-3 py-1 text-left text-xs font-mono text-zinc-400 select-none cursor-default hover:bg-zinc-800/70 hover:text-zinc-300"
          >
            PixelBlaze
          </div>
          {LIBRARY_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              data-testid="libraries-menu-item"
              onClick={() => openLibrary(name)}
              onMouseEnter={(e) => startShow(name, e.currentTarget)}
              onMouseLeave={startHide}
              className={rowClass(activeLibraryName === name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {hoveredLib && anchorRect && (
        <LibraryHoverCard
          name={hoveredLib}
          anchorRect={anchorRect}
          onMouseEnter={cancelHide}
          onMouseLeave={startHide}
        />
      )}
    </div>
  )
}
