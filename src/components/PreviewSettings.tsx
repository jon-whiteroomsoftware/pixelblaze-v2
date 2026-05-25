import { useState, useRef, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'

export function PreviewSettings() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const brightness = usePreviewStore((s) => s.brightness)
  const setBrightness = usePreviewStore((s) => s.setBrightness)
  const glowAmount = usePreviewStore((s) => s.grid.glowAmount)
  const gridRows = usePreviewStore((s) => s.grid.rows)
  const gridCols = usePreviewStore((s) => s.grid.cols)
  const setGrid = usePreviewStore((s) => s.setGrid)

  const [draftRows, setDraftRows] = useState(String(gridRows))
  const [draftCols, setDraftCols] = useState(String(gridCols))

  function commitGridSize() {
    const rows = Math.max(1, parseInt(draftRows, 10) || gridRows)
    const cols = Math.max(1, parseInt(draftCols, 10) || gridCols)
    setDraftRows(String(rows))
    setDraftCols(String(cols))
    setGrid({ rows, cols })
  }

  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Preview settings"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-amber-400/70 hover:bg-zinc-800 transition-colors"
      >
        <Settings size={13} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Preview settings panel"
          className="absolute top-full right-0 mt-1 w-56 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50 p-3 font-mono"
        >
          <section>
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Display
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Brightness</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">Glow</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={glowAmount}
                  onChange={(e) => setGrid({ glowAmount: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </label>
            </div>
          </section>

          <section className="mt-4">
            <h3 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-3">
              Grid Size
            </h3>
            <div className="flex items-center gap-2">
              <input
                aria-label="Grid columns"
                type="number"
                min={1}
                value={draftCols}
                onChange={(e) => setDraftCols(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitGridSize()}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-zinc-500">×</span>
              <input
                aria-label="Grid rows"
                type="number"
                min={1}
                value={draftRows}
                onChange={(e) => setDraftRows(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitGridSize()}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={commitGridSize}
                className="px-2 py-1 text-xs rounded border border-amber-500 text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                OK
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
