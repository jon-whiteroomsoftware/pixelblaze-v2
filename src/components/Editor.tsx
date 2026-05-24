import MonacoEditor, { BeforeMount, OnChange } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editorStore'
import { registerPixelblazeLanguage, PIXELBLAZE_LANG_ID } from './monaco/pixelblazeLanguage'

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineHeight: 20,
  fontFamily: "'Geist Mono', 'Cascadia Code', 'Fira Code', monospace",
  fontLigatures: true,
  scrollBeyondLastLine: false,
  wordWrap: 'off' as const,
  renderLineHighlight: 'all' as const,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  padding: { top: 12, bottom: 12 },
}

export function Editor() {
  const source = useEditorStore((s) => s.source)
  const setSource = useEditorStore((s) => s.setSource)

  const handleBeforeMount: BeforeMount = (monaco) => {
    registerPixelblazeLanguage(monaco)
  }

  const handleChange: OnChange = (value) => {
    if (value !== undefined) setSource(value)
  }

  return (
    <MonacoEditor
      height="100%"
      language={PIXELBLAZE_LANG_ID}
      theme="pixelblaze-dark"
      value={source}
      beforeMount={handleBeforeMount}
      onChange={handleChange}
      options={EDITOR_OPTIONS}
    />
  )
}
