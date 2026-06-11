import { useState, useCallback, useRef, useEffect } from 'react'
import { ExternalLink, FileText, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Editor } from '@/components/Editor'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { DimPills } from '@/components/DimPills'
import { PatternList } from '@/components/PatternList'
import { Preview } from '@/components/Preview'
import { PaneHeader } from '@/components/PaneHeader'
import { ControllerBar } from '@/components/ControllerBar'
import { LibrariesMenu } from '@/components/LibrariesMenu'
import { DocsMenu } from '@/components/DocsMenu'
import { DocsReader } from '@/components/DocsReader'
import { SendToController } from '@/components/SendToController'
import { useControllerStore } from '@/store/controllerStore'
import { MapModeHeader } from '@/components/MapModeHeader'
import { usePatternStore, PatternRecord } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { useDocsStore } from '@/store/docsStore'
import { forkSettingsSnapshot } from '@/store/settingsCascade'
import { bundle } from '@/engine/bundle'
import { LIBRARIES } from '@/pixelblaze/libs'
import { uniquePatternName } from '@/engine/patternName'
import { exportedDims } from '@/engine/exportedDims'
import { docExternalHref, getUserDoc, isDocId } from '@/docs/catalog'

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
  const removePattern = usePatternStore((s) => s.removePattern)
  const source = useEditorStore((s) => s.source)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const setSource = useEditorStore((s) => s.setSource)
  const setIsReadOnly = useEditorStore((s) => s.setIsReadOnly)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const setPreviewPatternName = useEditorStore((s) => s.setPreviewPatternName)
  const activeDocId = useDocsStore((s) => s.activeDocId)
  const openDoc = useDocsStore((s) => s.openDoc)
  const closeDocs = useDocsStore((s) => s.closeDocs)
  const activeDoc = getUserDoc(activeDocId)

  useEffect(() => {
    const syncFromHash = () => {
      const match = /^#\/docs\/([^/]+)$/.exec(window.location.hash)
      if (match && isDocId(match[1])) openDoc(match[1])
      else closeDocs()
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [closeDocs, openDoc])

  // On startup, probe extension presence (global) and, if a Controller IP was
  // remembered from a previous session, reconnect only that one (#210). Silent on
  // failure: a missing extension or unreachable Controller just stays disconnected.
  const autoConnectController = useControllerStore((s) => s.autoConnect)
  const detectExtension = useControllerStore((s) => s.detectExtension)
  useEffect(() => {
    void detectExtension()
    void autoConnectController()
  }, [autoConnectController, detectExtension])

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
    // Snapshot the demo's effective settings as frozen layer-1 overrides
    // BEFORE setActivePattern flips state, so the fork keeps the demo's curated look.
    const settings = forkSettingsSnapshot()
    const record: PatternRecord = {
      id,
      name,
      src: source,
      controls: {},
      settings,
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
  const [deletePatternOpen, setDeletePatternOpen] = useState(false)
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
  const [rightWidth, setRightWidth] = useState(460)
  const MIN_PREVIEW_WIDTH = 300

  const activeFileName =
    activeLibraryName ?? activeDemoName ?? userPatterns.find((p) => p.id === activePatternId)?.name ?? '—'
  const activePattern = activePatternId ? userPatterns.find((p) => p.id === activePatternId) : undefined

  const handleDeletePattern = useCallback(async () => {
    if (!activePatternId) return
    await removePattern(activePatternId)
    setDeletePatternOpen(false)
  }, [activePatternId, removePattern])

  const handleLeftDrag = useCallback((dx: number) => {
    setLeftWidth((w) => Math.max(120, w + dx))
  }, [])

  // Floor wide enough that the preview's primary nav row (layout map picker + play/pause,
  // both non-truncating) stays comfortable; only the pattern name gives up space (#63).
  const handleRightDrag = useCallback((dx: number) => {
    setRightWidth((w) => Math.max(MIN_PREVIEW_WIDTH, w - dx))
  }, [])

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="h-10 flex items-center px-4 border-b border-seam shrink-0 bg-panel">
        <span className="flex items-center gap-2 select-none">
          <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden className="shrink-0">
            <path d="M1 10 Q5 1 9 10 T17 10 T25 10" fill="none" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="25" cy="10" r="2.6" fill="#fbbf24" />
          </svg>
          <span
            aria-label="PXLBLZ"
            className="font-mono font-semibold text-zinc-100"
            style={{ fontSize: '17px', letterSpacing: '0.22em', textShadow: '0 0 14px rgba(245,158,11,.45)' }}
          >
            {'PXLBLZ'.split('').map((ch, i) => (
              // Each letter's keyframe (assigned by nth-child in index.css) places
              // its pulse so the lit dot ping-pongs P->Z->P across the wordmark.
              <span key={i} aria-hidden className="pxlblz-letter">
                {ch}
              </span>
            ))}
          </span>
        </span>
        {/* Left zone = identity + authoring reference (#254): Docs and Code sit beside
            the wordmark, mirroring the Controller pill family on the right. */}
        <span className="ml-5 flex items-center">
          <DocsMenu />
          <span className="ml-2">
            <LibrariesMenu />
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2.5">
          <ControllerBar />
        </span>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="shrink-0 flex flex-col" style={{ width: leftWidth }}>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PatternList />
          </div>
          {/* The live Controller dashboard moved out of this slot (#211): it now
              opens as a pinned popover anchored under its pill in the header. */}
        </aside>
        <Splitter onDrag={handleLeftDrag} />
        <main data-testid="editor-pane" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <PaneHeader>
            {activeDoc ? (
              <>
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  <FileText size={14} aria-hidden className="shrink-0 text-zinc-500" />
                  <span className="truncate text-zinc-200">{activeDoc.title}</span>
                  <span className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-structural sm:inline">
                    Docs
                  </span>
                </span>
                <a
                  href={docExternalHref(activeDoc.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded px-2 font-mono text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
                  title="Open document in a new tab"
                >
                  <ExternalLink size={13} aria-hidden />
                  <span className="hidden sm:inline">Open in tab</span>
                </a>
              </>
            ) : editorFlavor === 'map' ? (
              <MapModeHeader />
            ) : (
              <>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="truncate text-zinc-200">{activeFileName}</span>
              {(activeLibraryName !== null || activeDemoName !== null) && (
                <Lock
                  size={13}
                  strokeWidth={2.25}
                  className="shrink-0 text-zinc-400"
                  aria-label="read-only"
                />
              )}
              <DimPills dims={exportedDims(source)} />
              {activePatternId !== null && <CompileStatusBadge />}
            </span>
            {activeDemoName !== null && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
                onClick={handleForkDemo}
                title="Clone into Your Patterns"
              >
                Clone
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
            {activePattern !== undefined && (
              <AlertDialogRoot open={deletePatternOpen} onOpenChange={setDeletePatternOpen}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-zinc-500 bg-zinc-900/50 hover:bg-red-950/50 hover:text-red-300"
                  onClick={() => setDeletePatternOpen(true)}
                  title="Delete pattern"
                >
                  <Trash2 size={13} aria-hidden />
                  Delete
                </Button>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete pattern?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{activePattern.name}" will be permanently deleted and cannot be recovered.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleDeletePattern()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialogRoot>
            )}
            {/* Send to Controller works for any open pattern — user patterns and
                read-only demos alike (a demo pushes without first forking). */}
            {(activePatternId !== null || activeDemoName !== null) && <SendToController />}
              </>
            )}
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            {activeDoc ? <DocsReader doc={activeDoc} /> : <Editor />}
          </div>
        </main>
        <Splitter onDrag={handleRightDrag} />
        {/* The preview is an output/instrument surface (#150): no header strip — the
            canvas sits flush at the top and all controls live in the deck below it. */}
        <aside data-testid="preview-pane" className="shrink-0 flex flex-col min-h-0" style={{ width: rightWidth, minWidth: MIN_PREVIEW_WIDTH }}>
          <Preview />
        </aside>
      </div>
    </div>
  )
}
