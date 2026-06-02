import MonacoEditor, { BeforeMount, OnChange, OnMount } from '@monaco-editor/react'
import type * as monacoType from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { usePatternStore } from '@/store/patternStore'
import { useMapStore } from '@/store/mapStore'
import { registerPixelblazeLanguage, PIXELBLAZE_LANG_ID } from './monaco/pixelblazeLanguage'
import { validateSource } from '@/engine/validate'
import { parseMapSource } from '@/engine/maps'

const SYNC_TICK_MS = 4000
const PREVIEW_DEBOUNCE_MS = 600
// Upper bound on lines we synchronously tokenize on a source swap (see effect).
const FORCE_TOKENIZE_LINE_CAP = 2000

// Synchronously tokenize the model up to the cap so syntax colors are present
// before Monaco's next paint, avoiding a flash of plain (white) text. Pattern
// and library files are small; any lines past the cap tokenize lazily on scroll.
// `tokenization.forceTokenization` is a real runtime API but not part of
// monaco's public ITextModel type surface, so reach for it through a cast.
function forceTokenizeModel(model: monacoType.editor.ITextModel | null): void {
  if (!model) return
  const target = Math.min(model.getLineCount(), FORCE_TOKENIZE_LINE_CAP)
  if (target <= 0) return
  const tokenization = (model as unknown as { tokenization?: { forceTokenization?: (line: number) => void } })
    .tokenization
  tokenization?.forceTokenization?.(target)
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
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
  const editorFlavor = useEditorStore((s) => s.editorFlavor)
  const setSource = useEditorStore((s) => s.setSource)
  const setCompileStatus = useEditorStore((s) => s.setCompileStatus)
  const setPreviewSource = useEditorStore((s) => s.setPreviewSource)
  const compileStatus = useEditorStore((s) => s.compileStatus)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const updatePatternSrc = usePatternStore((s) => s.updatePatternSrc)

  const editorRef = useRef<monacoType.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoType | null>(null)
  const syncRef = useRef({ source, compileStatus, activePatternId, editorFlavor })
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep a ref current so the interval closure always reads the latest values
  useEffect(() => {
    syncRef.current = { source, compileStatus, activePatternId, editorFlavor }
  }, [source, compileStatus, activePatternId, editorFlavor])

  // Persistence tick: every SYNC_TICK_MS, auto-save the clean editor buffer to
  // IndexedDB. For a pattern that's clean source → the pattern record. For an open
  // map (flavor 'map'), a clean (parse-good) buffer is evaluated + baked into the
  // map record (#143, ADR-0008) — once per tick, never per keystroke (a runaway
  // map loop would freeze the tab, ADR-0002). Bake failures surface via the store.
  useEffect(() => {
    const id = setInterval(() => {
      const { source: s, compileStatus: status, activePatternId: pid, editorFlavor: flavor } = syncRef.current
      if (status !== 'good' || s === '') return
      if (flavor === 'map') void useMapStore.getState().bakeEditingMap()
      else if (pid) updatePatternSrc(pid, s)
    }, SYNC_TICK_MS)
    return () => clearInterval(id)
  }, [updatePatternSrc])

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerPixelblazeLanguage(monaco)
    // Map mode uses Monaco's built-in `javascript` language for syntax coloring,
    // but a map source is a bare `function(pixelCount){…}` expression — not a
    // valid top-level statement/module — so Monaco's TS worker flags it with a
    // spurious "unexpected identifier" squiggle. We feed our own parse-only markers
    // (owner 'pixelblaze', ADR-0008), so disable the worker's diagnostics entirely.
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
      noSuggestionDiagnostics: true,
    })
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    // On first load the source is often set before Monaco finishes mounting, so
    // the [source] effect below ran with no editor yet. Tokenize the initial
    // content here, before the editor's first paint, to avoid the white flash.
    forceTokenizeModel(editor.getModel())
  }

  // When the source swaps (switching patterns/libraries) @monaco-editor/react
  // applies the new value via executeEdits and Monaco repaints on its next
  // animation frame. Background tokenization is async, so that first paint would
  // show plain (white) text before syntax colors land. This effect runs after
  // the child's value-applying effect (child effects fire before parent
  // effects), so the model already holds the new text — we force it to tokenize
  // synchronously, before Monaco paints. (First-load content, set before mount,
  // is handled in handleMount instead.)
  useEffect(() => {
    forceTokenizeModel(editorRef.current?.getModel() ?? null)
  }, [source])

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

    // Map mode (#151, ADR-0008) authors plain JS, so the badge is a parse-only
    // check (no Pixelblaze dialect rules); patterns keep the dialect validator.
    const errors = editorFlavor === 'map' ? parseMapSource(source) : validateSource(source)
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
  }, [source, isReadOnly, editorFlavor, setCompileStatus])

  return (
    <MonacoEditor
      height="100%"
      language={editorFlavor === 'map' ? 'javascript' : PIXELBLAZE_LANG_ID}
      theme="pixelblaze-dark"
      value={source}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{ ...EDITOR_OPTIONS, readOnly: isReadOnly }}
    />
  )
}
