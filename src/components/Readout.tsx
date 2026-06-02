import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'

// The Readout (#150): a read-only telemetry band in the preview deck. Telemetry
// (fps + elapsed) is unconditional; the layout-dims cell shows only when there's a
// regular grid. Pattern-variable watching lives in its own Variables section now.
export function Readout() {
  const fps = usePreviewStore((s) => s.fps)
  const elapsed = usePreviewStore((s) => s.elapsed)
  const layoutLabel = useEditorStore((s) => s.layoutLabel)

  // Always-on telemetry cells, in reading order: fps · elapsed · (layout dims when a
  // regular grid is live). pixelCount is now an editable control in the deck above,
  // so it no longer echoes here.
  const cells: { name: string; value: string }[] = [
    { name: 'fps', value: fps === null ? '—' : fps.toFixed(1) },
    { name: 'elapsed', value: elapsed === null ? '—' : `${(elapsed / 1000).toFixed(1)}s` },
  ]
  if (layoutLabel) cells.push({ name: 'layout', value: layoutLabel })

  return (
    <div className="font-mono text-xs border-t border-zinc-800 mt-1 pt-1.5 pb-3 pr-3">
      <h4 className="text-[11px] font-semibold text-structural uppercase tracking-wider mb-2">
        Readout
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {cells.map((cell) => (
          <ReadoutCell key={cell.name} name={cell.name} value={cell.value} />
        ))}
      </div>
    </div>
  )
}

function ReadoutCell({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 min-w-0">
      <span className="text-zinc-400 truncate">{name}</span>
      <span className="text-live tabular-nums truncate">{value}</span>
    </div>
  )
}
