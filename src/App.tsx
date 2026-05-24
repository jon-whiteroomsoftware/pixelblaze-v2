import { Button } from '@/components/ui/button'
import { Editor } from '@/components/Editor'
import { CompileStatusBadge } from '@/components/CompileStatusBadge'
import { PatternList } from '@/components/PatternList'
import { Preview } from '@/components/Preview'
import { PaneHeader } from '@/components/PaneHeader'
import { usePreviewStore } from '@/store/previewStore'
import { usePatternStore } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'

export default function App() {
  const isRunning = usePreviewStore((s) => s.isRunning)
  const toggle = usePreviewStore((s) => s.toggle)

  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeLibraryName = usePatternStore((s) => s.activeLibraryName)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const previewPatternName = useEditorStore((s) => s.previewPatternName)

  const activeFileName =
    activeLibraryName ?? activeDemoName ?? userPatterns.find((p) => p.id === activePatternId)?.name ?? '—'

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="h-10 flex items-center px-4 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-semibold tracking-wide">Pixelblaze IDE</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="w-56 border-r border-zinc-800 shrink-0 flex flex-col">
          <PaneHeader>Patterns</PaneHeader>
          <div className="flex-1 overflow-y-auto">
            <PatternList />
          </div>
        </aside>
        <main data-testid="editor-pane" className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <PaneHeader>
            <span className="flex-1 truncate">{activeFileName}</span>
            {activePatternId !== null && <CompileStatusBadge />}
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            <Editor />
          </div>
        </main>
        <aside data-testid="preview-pane" className="w-80 border-l border-zinc-800 shrink-0 flex flex-col">
          <PaneHeader>
            <span className="flex-1 truncate">{previewPatternName || '—'}</span>
            <Button size="sm" variant="outline" data-testid="shadcn-button" onClick={toggle}>
              {isRunning ? 'Pause' : 'Run'}
            </Button>
          </PaneHeader>
          <div className="flex-1 overflow-hidden">
            <Preview />
          </div>
        </aside>
      </div>
    </div>
  )
}
