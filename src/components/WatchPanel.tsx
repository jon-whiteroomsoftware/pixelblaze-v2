import { usePreviewStore } from '@/store/previewStore'

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

export function WatchPanel() {
  const watchedBuiltins = usePreviewStore((s) => s.watchedBuiltins)
  const watchedPatternVars = usePreviewStore((s) => s.watchedPatternVars)
  const watchValues = usePreviewStore((s) => s.watchValues)

  const hasBuiltins = watchedBuiltins.length > 0
  const hasPatternVars = watchedPatternVars.length > 0

  if (!hasBuiltins && !hasPatternVars) return null

  return (
    <div className="font-mono text-xs border-t border-zinc-800 mt-2 pt-2 pb-3 pr-3">
      {hasBuiltins && (
        <section className="mb-3">
          <h4 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-1">
            Built-ins
          </h4>
          <WatchRows names={watchedBuiltins} values={watchValues} />
        </section>
      )}
      {hasPatternVars && (
        <section>
          <h4 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-1">
            Pattern Variables
          </h4>
          <WatchRows names={watchedPatternVars} values={watchValues} />
        </section>
      )}
    </div>
  )
}

function WatchRows({ names, values }: { names: string[]; values: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
      {names.map((name) => (
        <div key={name} className="flex justify-between gap-2 min-w-0">
          <span className="text-zinc-400 truncate">{name}</span>
          <span className="text-amber-400 tabular-nums truncate">{formatValue(values[name])}</span>
        </div>
      ))}
    </div>
  )
}
