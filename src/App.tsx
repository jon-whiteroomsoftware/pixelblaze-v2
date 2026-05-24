import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      <header data-testid="top-bar" className="h-10 flex items-center px-4 border-b border-zinc-800 shrink-0 gap-3">
        <span className="text-sm font-semibold tracking-wide">Pixelblaze IDE</span>
        <Button size="sm" variant="outline" data-testid="shadcn-button">Run</Button>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside data-testid="left-pane" className="w-56 border-r border-zinc-800 shrink-0" />
        <main data-testid="editor-pane" className="flex-1 min-w-0" />
        <aside data-testid="preview-pane" className="w-80 border-l border-zinc-800 shrink-0" />
      </div>
    </div>
  )
}
