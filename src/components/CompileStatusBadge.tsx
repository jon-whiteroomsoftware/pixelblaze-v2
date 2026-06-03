import { useEditorStore } from '@/store/editorStore'
import { StatusDot } from './StatusDot'

export function CompileStatusBadge() {
  const status = useEditorStore((s) => s.compileStatus)

  return (
    <StatusDot
      tone={status === 'good' ? 'ok' : 'error'}
      testId="compile-status"
      data-status={status}
    />
  )
}
