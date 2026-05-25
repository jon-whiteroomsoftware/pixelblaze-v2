import MonacoEditor, { BeforeMount, OnChange, OnMount } from '@monaco-editor/react'
import type * as monacoType from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { registerPixelblazeLanguage, PIXELBLAZE_LANG_ID } from './monaco/pixelblazeLanguage'
import { validateSource } from '@/engine/validate'

const SYNC_TICK_MS = 4000
const PREVIEW_DEBOUNCE_MS = 600

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "'Geist Mono', 'Cascadia Code', 'Fira Code', monospace",
  fontLigatures: true,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'off' as const,
  renderLineHighlight: 'all' as const,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  padding: { top: 12, bottom: 12 },
}

export function Editor() {
  const source = useEditorStore((s) => s.source)
  const isReadOnly = useEditorStore((s) => s.isReadOnly)
  const setSource = useEditorStore((s) => s.setSource)
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const updatePatternSrc = usePatternStore((s) => s.updatePatternSrc)

  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoType | null>(null)
  const syncRef = useRef({ source, compileStatus, activePatternId })
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep a ref current so the interval closure always reads the latest values
  useEffect(() => {
    syncRef.current = { source, compileStatus, activePatternId }
  }, [source, compileStatus, activePatternId])

  // Persistence tick: auto-save clean source to IndexedDB every SYNC_TICK_MS
  useEffect(() => {
    const id = setInterval(() => {
      const { source: s, compileStatus: status, activePatternId: pid } = syncRef.current
      if (status === 'good' && pid) updatePatternSrc(pid, s)
    }, SYNC_TICK_MS)
    return () => clearInterval(id)
  }, [updatePatternSrc])

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerPixelblazeLanguage(monaco)
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
  }

  const handleChange: OnChange = (value) => {
    if (value === undefined) return
    setSource(value)
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      const { compileStatus: status, activePatternId: pid } = syncRef.current
      if (status === 'good' && pid) setPreviewSource(value)
    }, PREVIEW_DEBOUNCE_MS)
  }

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return

    const model = editor.getModel()
    if (!model) return

    // Library files are not user-authored patterns — skip validation
    if (isReadOnly) {
      monaco.editor.setModelMarkers(model, 'pixelblaze', [])
      return
    }

    const errors = validateSource(source)
    setCompileStatus(errors.length === 0 ? 'good' : 'broken')

    monaco.editor.setModelMarkers(
      model,
      'pixelblaze',
      errors.map((err) => {
        const startColumn = err.column + 1
        const endColumn = Math.max(startColumn + 1, model.getLineMaxColumn(err.line))
        return {
          severity: monaco.MarkerSeverity.Error,
          message: err.message,
          startLineNumber: err.line,
          startColumn,
          endLineNumber: err.line,
          endColumn,
        }
      }),
    )
  }, [source, isReadOnly, setCompileStatus])

  return (
    <MonacoEditor
      height="100%"
      language={PIXELBLAZE_LANG_ID}
      theme="pixelblaze-dark"
      value={source}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{ ...EDITOR_OPTIONS, readOnly: isReadOnly }}
    />
  )
}
