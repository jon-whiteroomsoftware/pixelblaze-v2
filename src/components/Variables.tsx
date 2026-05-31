import { ChevronDown } from 'lucide-react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (Array.isArray(v)) {
    const items = (v as number[]).slice(0, 8).map((n) =>
      typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : '?'
    )
    return items.join(', ') + (v.length > 8 ? ', …' : '')
  }
  return String(v)
}

// Variables (#150): the bottom-most deck section — a single all-or-nothing turn-down
// that reveals every exported pattern variable (no per-variable or sensor-builtin
// checkboxes; those went out with the deleted settings dialog). Split out of the
// Readout so it sits below the author's pattern controls.
export function Variables() {
  const watchPatternVars = usePreviewStore((s) => s.watchPatternVars)
  const setWatchPatternVars = usePreviewStore((s) => s.setWatchPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)
  const patternVars = useEditorStore((s) => s.patternVars)

  if (patternVars.length === 0) return null

  return (
    <section className="font-mono text-xs mt-1 pt-1.5 pb-3 pr-3">
      <button
        aria-expanded={watchPatternVars}
        onClick={() => setWatchPatternVars(!watchPatternVars)}
        className="w-full flex items-center justify-between gap-1 text-[11px] font-semibold text-amber-500/60 uppercase tracking-wider hover:text-amber-400 transition-colors"
      >
        <span>Variables</span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform ${watchPatternVars ? '' : '-rotate-90'}`}
        />
      </button>
      {watchPatternVars && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
          {patternVars.map((name) => (
            <div key={name} className="flex justify-between gap-2 min-w-0">
              <span className="text-zinc-400 truncate">{name}</span>
              <span className="text-amber-400 tabular-nums truncate">
                {formatValue(watchValues[name])}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
