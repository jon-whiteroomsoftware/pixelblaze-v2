import { useState, useCallback, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Editor } from '@/components/Editor'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { PatternList } from '@/components/PatternList'
import { Preview } from '@/components/Preview'
import { PaneHeader } from '@/components/PaneHeader'
import { MapModeHeader } from '@/components/MapModeHeader'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { bundle } from '@/engine/bundle'
import { LIBRARIES } from '@/pixelblaze/libs'
import { uniquePatternName } from '@/engine/patternName'
import { exportedDims } from '@/engine/exportedDims'

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function Splitter({ onDrag }: { onDrag: (dx: number) => void }) {
  const lastX = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    lastX.current = e.clientX

    const onMove = (ev: MouseEvent) => {
      onDrag(ev.clientX - lastX.current)
      lastX.current = ev.clientX
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    e.preventDefault()
  }

  return (
    <div
      className="w-1 shrink-0 bg-seam hover:bg-zinc-600 cursor-col-resize transition-colors select-none"
      onMouseDown={handleMouseDown}
    />
  )
}

export default function App() {
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const addPattern = usePatternStore((s) => s.addPattern)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const source = useEditorStore((s) => s.source)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)

  // If source becomes empty while a pattern is active (e.g. after a store hot-reload),
  // restore it from the pattern record so the editor doesn't go blank.
  useEffect(() => {
    if (source !== '' || !activePatternId) return
    const p = userPatterns.find((p) => p.id === activePatternId)
    if (!p) return
    setSource(p.src)
    setPreviewSource(p.src)
    setIsReadOnly(false)
  }, [source, activePatternId, userPatterns, setSource, setPreviewSource, setIsReadOnly])

  const handleForkDemo = useCallback(async () => {
    if (!activeDemoName) return
    const id = generateId()
    const existingNames = userPatterns.map((p) => p.name)
    const name = uniquePatternName(activeDemoName, existingNames)
    const record: PatternRecord = {
      id,
      name,
      src: source,
      controls: {},
      updatedAt: Date.now(),
    }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setIsReadOnly(false)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
  }, [activeDemoName, source, userPatterns, addPattern, setActivePattern, setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName])

  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current) }, [])

  const handleCopy = useCallback(() => {
    const { code } = bundle(source, LIBRARIES)
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }, [source])

  const [leftWidth, setLeftWidth] = useState(224)
  const [rightWidth, setRightWidth] = useState(320)

  const activeFileName =
    activeLibraryName ?? activeDemoName ?? userPatterns.find((p) => p.id === activePatternId)?.name ?? '—'

  const handleLeftDrag = useCallback((dx: number) => {
    setLeftWidth((w) => Math.max(120, w + dx))
  }, [])

  const handleRightDrag = useCallback((dx: number) => {
    setRightWidth((w) => Math.max(200, w - dx))
  }, [])

  return (
    <div className="app-vignette flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="h-10 flex items-center px-4 border-b border-seam shrink-0 bg-panel">
        <span className="flex items-center gap-2 select-none">
          <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden className="shrink-0">
            <path d="M1 10 Q5 1 9 10 T17 10 T25 10" fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="25" cy="10" r="2.6" fill="#fbbf24" />
          </svg>
          <span
            className="font-mono font-semibold text-zinc-100"
            style={{ fontSize: '17px', letterSpacing: '0.22em', textShadow: '0 0 14px rgba(245,158,11,.45)' }}
          >
            PXLBLZ
          </span>
        </span>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          <div className="flex-1 overflow-y-auto">
            <PatternList />
          </div>
        </aside>
        <Splitter onDrag={handleLeftDrag} />
        <main data-testid="editor-pane" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <PaneHeader>
            {editorFlavor === 'map' ? (
              <MapModeHeader />
            ) : (
              <>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="truncate">{activeFileName}</span>
              {exportedDims(source).map((d) => (
                <span
                  key={d}
                  className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none"
                >
                  {d}D
                </span>
              ))}
              {activePatternId !== null && <CompileStatusBadge />}
              {(activeLibraryName !== null || activeDemoName !== null) && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-400 border border-zinc-700 leading-none">
                  read-only
                </span>
              )}
            </span>
            {activeDemoName !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
                onClick={handleForkDemo}
              >
                Edit
              </Button>
            )}
            {activePatternId !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-30"
                disabled={compileStatus === 'broken'}
                onClick={handleCopy}
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
            )}
              </>
            )}
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            <Editor />
          </div>
        </main>
        <Splitter onDrag={handleRightDrag} />
        {/* The preview is an output/instrument surface (#150): no header strip — the
            canvas sits flush at the top and all controls live in the deck below it. */}
        <aside data-testid="preview-pane" className="shrink-0 flex flex-col min-h-0" style={{ width: rightWidth }}>
          <Preview />
        </aside>
      </div>
    </div>
  )
}
