// Pure presentation logic for the nav connection indicator (H4, issue #196).
// Maps a backend-neutral `ControllerStatus` (from the ControllerProvider seam)
// to the small bundle of strings + tone the nav icon renders. No React, no
// transport specifics — the component is a thin wrapper over this.

import type { ControllerStatus } from './ControllerProvider'

/** Visual tone the indicator dot/icon uses. Maps to a colour in the component;
 *  kept symbolic here so this stays framework- and palette-agnostic. */
export type ControllerStatusTone = 'absent' | 'idle' | 'pending' | 'live' | 'error'

export interface ControllerStatusView {
  /** The discriminated-union tag, surfaced for `data-status` and tests. */
  kind: ControllerStatus['kind']
  tone: ControllerStatusTone
  /** Short label for the icon's accessible name / tooltip. */
  label: string
}

/** Describe a status for the nav indicator. Reads provider state only — it never
 *  triggers connect/detect; H4 is display-only (the dropdown arrives in H5). */
export function describeControllerStatus(status: ControllerStatus): ControllerStatusView {
  switch (status.kind) {
    case 'no-extension':
      return { kind: status.kind, tone: 'absent', label: 'No Controller helper installed' }
    case 'extension-present':
      return { kind: status.kind, tone: 'idle', label: 'No Controller connected' }
    case 'connecting':
      return { kind: status.kind, tone: 'pending', label: `Connecting to ${status.target.address}…` }
    case 'connected': {
      const { name, address } = status.controller
      return { kind: status.kind, tone: 'live', label: `Connected to ${name ?? address}` }
    }
    case 'error':
      return { kind: status.kind, tone: 'error', label: status.message }
  }
}
