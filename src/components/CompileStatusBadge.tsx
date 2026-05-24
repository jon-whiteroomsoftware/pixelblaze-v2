import { useEditorStore } from '@/store/editorStore'

export function CompileStatusBadge() {
  const status = useEditorStore((s) => s.compileStatus)

  return status === 'good' ? (
    <span
      data-testid="compile-status"
      data-status="good"
      className="text-xs font-medium text-emerald-400"
    >
      Good
    </span>
  ) : (
    <span
      data-testid="compile-status"
      data-status="broken"
      className="text-xs font-medium text-red-400"
    >
      Broken
    </span>
  )
}
