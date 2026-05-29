import { useState, useCallback, useRef, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Editor } from '@/components/Editor'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { PatternList } from '@/components/PatternList'
import { Preview } from '@/components/Preview'
import { PreviewSettings } from '@/components/PreviewSettings'
import { SpeedSelector } from '@/components/SpeedSelector'
import { PaneHeader } from '@/components/PaneHeader'
import { usePreviewStore } from '@/store/previewStore'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { bundle } from '@/engine/bundle'
import { LIBRARIES } from '@/pixelblaze/libs'
import { NEW_PATTERN_SRC } from '@/pixelblaze/newPattern'
import { uniquePatternName } from '@/engine/patternName'
import { parseEpe } from '@/engine/epeImport'

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
      className="w-1 shrink-0 bg-zinc-800 hover:bg-zinc-600 cursor-col-resize transition-colors select-none"
      onMouseDown={handleMouseDown}
    />
  )
}

export default function App() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)

  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const addPattern = usePatternStore((s) => s.addPattern)
  const setActivePattern = usePatternStore((s) => s.setActivePattern)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)
  const source = useEditorStore((s) => s.source)
  const compileStatus = useEditorStore((s) => s.compileStatus)
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current) }, [])

  const showImportError = useCallback((msg: string) => {
    setImportError(msg)
    if (importErrorTimerRef.current) clearTimeout(importErrorTimerRef.current)
    importErrorTimerRef.current = setTimeout(() => setImportError(null), 4000)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result
      if (typeof text !== 'string') return
      let parsed
      try {
        parsed = parseEpe(text)
      } catch (err) {
        showImportError(err instanceof Error ? err.message : 'Failed to import EPE file')
        return
      }
      const { userPatterns, addPattern, setActivePattern } = usePatternStore.getState()
      const { setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName } = useEditorStore.getState()
      const id = generateId()
      const existingNames = userPatterns.map((p) => p.name)
      const name = uniquePatternName(parsed.name, existingNames)
      const record: PatternRecord = {
        id,
        name,
        src: parsed.src,
        controls: {},
        updatedAt: Date.now(),
      }
      await addPattern(record)
      setActivePattern(id)
      setSource(record.src)
      setIsReadOnly(false)
      setPreviewSource(record.src)
      setPreviewPatternName(record.name)
    }
    reader.readAsText(file)
  }, [showImportError])

  const handleCreate = useCallback(async () => {
    const id = generateId()
    const existingNames = userPatterns.map((p) => p.name)
    const name = uniquePatternName('Untitled Pattern', existingNames)
    const record: PatternRecord = {
      id,
      name,
      src: NEW_PATTERN_SRC,
      controls: {},
      updatedAt: Date.now(),
    }
    await addPattern(record)
    setActivePattern(id)
    setSource(record.src)
    setIsReadOnly(false)
    setPreviewSource(record.src)
    setPreviewPatternName(record.name)
  }, [userPatterns, addPattern, setActivePattern, setSource, setIsReadOnly, setPreviewSource, setPreviewPatternName])

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
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="h-10 flex items-center px-4 border-b border-zinc-800 shrink-0 bg-zinc-900">
        <span className="text-base font-mono uppercase tracking-widest text-amber-500/70">
          Pixelbl<span className="relative inline-block" style={{ marginLeft: '-0.05em', marginRight: '-0.05em' }}>
            <span className="absolute select-none" style={{ fontSize: '1.26em', top: '-0.35em', left: '50%', transform: 'translateX(calc(-50% - 1px))', opacity: 0.58, zIndex: 0 }}>🔥</span>
            <span className="relative" style={{ zIndex: 1 }}>a</span>
          </span>ze IDE
        </span>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".epe"
            className="hidden"
            onChange={handleFileChange}
          />
          <PaneHeader>
            {importError
              ? <span className="flex-1 min-w-0 truncate text-red-400 text-xs">{importError}</span>
              : <span className="flex-1">Patterns</span>
            }
            <Button size="sm" variant="ghost" className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300" onClick={() => fileInputRef.current?.click()}>Open</Button>
            <Button size="sm" variant="ghost" className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300" onClick={handleCreate}>New</Button>
          </PaneHeader>
          <div className="flex-1 overflow-y-auto">
            <PatternList />
          </div>
        </aside>
        <Splitter onDrag={handleLeftDrag} />
        <main data-testid="editor-pane" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <PaneHeader>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="truncate">{activeFileName}</span>
              {activePatternId !== null && <CompileStatusBadge />}
              {(activeLibraryName !== null || activeDemoName !== null) && (
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide uppercase text-zinc-500 border border-zinc-700 leading-none">
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
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            <Editor />
          </div>
        </main>
        <Splitter onDrag={handleRightDrag} />
        <aside data-testid="preview-pane" className="shrink-0 flex flex-col" style={{ width: rightWidth }}>
          <PaneHeader>
            <span className="flex-1 truncate">{previewPatternName || '—'}</span>
            <PreviewSettings />
            <SpeedSelector />
            <button
              aria-label={isRunning ? 'Pause' : 'Run'}
              data-testid="shadcn-button"
              onClick={toggle}
              className={`flex items-center justify-center w-6 h-6 rounded hover:bg-zinc-700 transition-colors ${
                isRunning ? 'text-green-500 hover:text-green-400' : 'text-red-500 hover:text-red-400'
              }`}
            >
              {isRunning ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            <Preview />
          </div>
        </aside>
      </div>
    </div>
  )
}
