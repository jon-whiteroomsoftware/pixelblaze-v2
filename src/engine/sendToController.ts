// Pure gating logic for the "Send to Controller" action (H9, issue #201). Decides
// whether the editor-header Send button is enabled, and — when it isn't — the
// reason to surface. No React, no transport specifics; the button is a thin shell
// over this.
//
// Send is gated on two conditions (the H9 lens): a Controller is connected, AND
// the open pattern's dimensionality matches the Controller's installed map. The
// map dimensionality comes from reading the installed pixel map back through the
// provider seam (getPixelMap) — an unconfirmed firmware capability (H13) pulled
// forward here. When it can't be read (mapDim === null) we deliberately do NOT
// block: we can't prove a mismatch, and a permanently-disabled Send would be worse
// than letting a confident user push. So the dimensionality check applies only
// when the map dimension is actually known.

import type { ControllerStatus } from './ControllerProvider'

/** A pattern/map coordinate dimension, or null when it isn't known. */
export type MapDimension = 1 | 2 | 3 | null

/** Derive a pixel map's dimensionality from its coordinate tuples: the arity of
 *  the first point (1/2/3). Returns null for an empty/absent/malformed map. */
export function mapDimension(map: number[][] | null | undefined): MapDimension {
  if (!map || map.length === 0) return null
  const first = map[0]
  if (!Array.isArray(first)) return null
  const d = first.length
  return d === 1 || d === 2 || d === 3 ? d : null
}

export interface SendGateInput {
  /** Current Controller connection status. */
  status: ControllerStatus
  /** The open pattern's native (coordinate) dimensionality. */
  patternDim: 1 | 2 | 3
  /** The connected Controller's installed-map dimensionality, or null if unknown. */
  mapDim: MapDimension
  /** Editor compile state — a broken pattern can't be compiled or pushed. Defaults
   *  to 'good' when omitted (the H9 gate predates this). */
  compileStatus?: 'good' | 'broken'
  /** True when the open pattern's current source already matches what was last
   *  pushed to this Controller — nothing to send until it's edited. Defaults false. */
  alreadyPushed?: boolean
}

export interface SendGate {
  /** Whether the Send button is actionable. */
  enabled: boolean
  /** Why it's disabled — surfaced as the button's tooltip. Absent when enabled. */
  reason?: string
}

/** Decide whether Send-to-Controller is enabled, and why not when it isn't. */
export function describeSendToController({
  status,
  patternDim,
  mapDim,
  compileStatus = 'good',
  alreadyPushed = false,
}: SendGateInput): SendGate {
  if (status.kind !== 'connected') {
    return { enabled: false, reason: 'Connect a Controller to send' }
  }
  if (compileStatus !== 'good') {
    return { enabled: false, reason: "Fix the pattern's errors before sending" }
  }
  if (mapDim !== null && mapDim !== patternDim) {
    return {
      enabled: false,
      reason: `Pattern is ${patternDim}D but the Controller's map is ${mapDim}D`,
    }
  }
  if (alreadyPushed) {
    return { enabled: false, reason: 'No changes since the last send' }
  }
  return { enabled: true }
}

// ── run-vs-save mode (H?, issue #238) ─────────────────────────────────────────
//
// Send-to-Controller carries one armed *mode*: run-only (play on the device, the
// default) or save (persist to the device's Saved Patterns, #236). The mode is a
// sticky toggle beside the button. Two pure helpers below keep the mode-derived
// logic out of the component: the dirty gate splits by mode (run and save are
// distinct acts — a clean run does not satisfy a pending save), and the action
// label flips its glyph + tooltip with the mode.

/** The armed Send mode: `run` plays the pattern on the device under a throwaway id;
 *  `save` persists it to Saved Patterns (#236). */
export type SendMode = 'run' | 'save'

export interface DirtyGateInput {
  /** The armed mode — selects which last-pushed record to compare against. */
  mode: SendMode
  /** The open pattern's current clean source. Empty → never "already pushed". */
  source: string
  /** Source last *run* to this Controller for this pattern (run-mode record). */
  lastRunSource?: string
  /** Source last *saved* to this Controller for this pattern (save-mode record). */
  lastSavedSource?: string
}

/** Decide whether the current source already matches what was last pushed *in the
 *  armed mode* — the mode-split dirty gate (#238). Run and save are tracked
 *  separately, so arming the other mode after a clean push re-enables Send. */
export function isAlreadyPushed({
  mode,
  source,
  lastRunSource,
  lastSavedSource,
}: DirtyGateInput): boolean {
  if (source.length === 0) return false
  const last = mode === 'save' ? lastSavedSource : lastRunSource
  return last === source
}

/** The verb the Send button surfaces for the armed mode, used for its tooltip when
 *  the action is enabled: "Play on <name>" (run) / "Save to <name>" (save). The
 *  glyph choice mirrors this (Play vs Save), decided in the component. */
export function describeSendAction(mode: SendMode, name: string): { tooltip: string } {
  return { tooltip: mode === 'save' ? `Save to ${name}` : `Play on ${name}` }
}

// ── map send (H12, issue #204) ────────────────────────────────────────────────
//
// The map editor's own Send-to-Controller action, the map analogue of the pattern
// gate above. Pushing a map writes the device's single shared map slot — it
// "configures the installation, not the pattern" — so it is gated independently of
// any pattern: a Controller must be connected, the open map must have baked points
// to send, and (the dirty gate) the current bake must differ from the last push.
// Map *dimensionality* is irrelevant here — we are replacing the device map, not
// matching it — so there is no dim check.

export interface SendMapGateInput {
  /** Current Controller connection status. */
  status: ControllerStatus
  /** Whether the open map has baked coordinates to send (an unbaked map can't push). */
  hasBakedPoints: boolean
  /** True when the open map's current bake already matches what was last pushed to
   *  this Controller — nothing to send until it's edited/re-baked. Defaults false. */
  alreadyPushed?: boolean
}

/** Decide whether the map editor's Send-to-Controller is enabled, and why not. */
export function describeSendMap({
  status,
  hasBakedPoints,
  alreadyPushed = false,
}: SendMapGateInput): SendGate {
  if (status.kind !== 'connected') {
    return { enabled: false, reason: 'Connect a Controller to send' }
  }
  if (!hasBakedPoints) {
    return { enabled: false, reason: 'Bake the map before sending' }
  }
  if (alreadyPushed) {
    return { enabled: false, reason: 'No changes since the last send' }
  }
  return { enabled: true }
}
