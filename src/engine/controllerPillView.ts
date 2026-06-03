// Pure presentation logic for a Controller pill (#210). Maps one keyed-store
// ControllerEntry to the small bundle of strings + tone a pill renders. No React,
// no transport specifics — the pill component is a thin wrapper over this.

import type { ControllerStatusTone } from './controllerStatusView'

/** The lifecycle phase a Controller pill is in. Born `pending` on connect-attempt,
 *  settles to `live` or `error`. */
export type ControllerPhase = 'pending' | 'live' | 'error'

export interface ControllerEntryView {
  ip: string
  nickname?: string
  phase: ControllerPhase
}

export interface ControllerPillView {
  /** Pill label: the nickname once live and named, else the IP (or "Connecting…"
   *  while pending with nothing better to show). */
  label: string
  /** The IP, surfaced as the pill's tooltip in every state. */
  tooltip: string
  /** Dot tone, or null when no dot should show (issue: no dot until pending/live). */
  tone: ControllerStatusTone | null
  /** Whether the status dot renders at all. */
  showDot: boolean
}

/** Describe a Controller entry for its pill. */
export function describeControllerPill(entry: ControllerEntryView): ControllerPillView {
  const label =
    entry.phase === 'live' && entry.nickname
      ? entry.nickname
      : entry.ip || 'Connecting…'

  const tone: ControllerStatusTone | null =
    entry.phase === 'pending' ? 'pending' : entry.phase === 'live' ? 'live' : 'error'

  return {
    label,
    tooltip: entry.ip,
    tone,
    // A dot always shows for these three phases (pending pulses, live is lit,
    // error is red); there is simply never an entry without one of them.
    showDot: true,
  }
}
