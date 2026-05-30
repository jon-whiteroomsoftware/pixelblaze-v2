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
  const fps = usePreviewStore((s) => s.fps)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const grid = usePreviewStore((s) => s.grid)

  const hasPatternVars = watchedPatternVars.length > 0
  // The built-ins area always shows the fps / size / renderer readout. fps and
  // size hold the left column for rows 1–2 with renderer in the right column of
  // row 2; the watched built-ins flow into the remaining cells, so the default
  // reads:
  //   fps        elapsed
  //   size       renderer
  //   pixelCount
  // Any further watched built-ins wrap onto the rows below.
  const sizeValue = `${grid.cols}×${grid.rows}`
  const fpsValue = fps === null ? '—' : fps.toFixed(1)
  const rendererValue = fidelity === 'fast' ? 'fast' : 'precise'
  const builtinCells: { name: string; value: string }[] = [{ name: 'fps', value: fpsValue }]
  if (watchedBuiltins[0] !== undefined) {
    builtinCells.push({ name: watchedBuiltins[0], value: formatValue(watchValues[watchedBuiltins[0]]) })
  }
  builtinCells.push({ name: 'size', value: sizeValue })
  builtinCells.push({ name: 'renderer', value: rendererValue })
  for (let i = 1; i < watchedBuiltins.length; i++) {
    builtinCells.push({ name: watchedBuiltins[i], value: formatValue(watchValues[watchedBuiltins[i]]) })
  }

  return (
    <div className="font-mono text-xs border-t border-zinc-800 mt-2 pt-2 pb-3 pr-3">
      <section className="mb-3">
        <h4 className="text-[10px] font-semibold text-amber-500/60 uppercase tracking-wider mb-1">
          Built-ins
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {builtinCells.map((cell) => (
            <ReadoutCell key={cell.name} name={cell.name} value={cell.value} />
          ))}
        </div>
      </section>
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

function ReadoutCell({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-zinc-400 truncate">{name}</span>
      <span className="text-amber-400 tabular-nums truncate">{value}</span>
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
