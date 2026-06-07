import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { usePatternStore } from '@/store/patternStore'
import { resolveActiveProgramName } from '@/engine/controllerPanelView'
import { exportedDims } from '@/engine/exportedDims'
import { findPatternSource } from '@/engine/findPatternSource'
import { DimPills } from '@/components/DimPills'

// The controller panel's title (#consistency): the device's running pattern name
// plus a dimensionality cue, mirroring the editor and preview titles. The device
// name/IP is dropped from here — it already labels the pill this popover hangs
// from, so repeating it was redundant.
//
// Dims are best-effort: the device reports a program's name but not its render
// dimensions, so we recover them by resolving the running name back to a source we
// hold locally (a built-in demo or a saved user pattern) and scanning that. A
// pattern that only lives on the device — never imported here — shows the name
// alone.
export function ControllerPanelTitle() {
  const activeProgramId = useControllerPanelStore((s) => s.activeProgramId)
  const programs = useControllerPanelStore((s) => s.programs)
  const programLabels = useControllerPanelStore((s) => s.programLabels)
  const userPatterns = usePatternStore((s) => s.userPatterns)

  const { patternName, patternUnsaved } = resolveActiveProgramName(
    activeProgramId,
    programs,
    programLabels,
  )
  const source = patternName !== '—' ? findPatternSource(patternName, userPatterns) : null
  const dims = source ? exportedDims(source) : []

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-zinc-200" title={patternName}>
        {patternName}
        {patternUnsaved && (
          <span
            className="text-zinc-500"
            title="Running but not saved on the device — a run-only push (#237)."
            data-testid="controller-pattern-unsaved"
          >
            {' · unsaved'}
          </span>
        )}
      </span>
      <DimPills dims={dims} />
    </span>
  )
}
