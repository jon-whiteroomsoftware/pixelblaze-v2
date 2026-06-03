// Pure presentation logic for the Controller panel telemetry (H6, issue #198).
// Maps the polled live state — active program id + the device's program list +
// reported FPS — into the read-only display strings the panel renders. No React,
// no transport specifics; the panel is a thin wrapper over this.

import type { ProgramListEntry } from './PixelblazeConnection'

export interface ControllerPanelTelemetry {
  /** Id of the program the Controller is currently running, if any. */
  activeProgramId?: string
  /** The Controller's stored program list, used to resolve the id to a name. */
  programs: ProgramListEntry[]
  /** Device-reported frame rate; `null` until a frame rate has been reported. */
  fps: number | null
}

export interface ControllerPanelView {
  /** Human label for the active pattern: its name, else the raw id, else '—'. */
  patternName: string
  /** FPS to one decimal, or '—' when not yet reported. */
  fpsLabel: string
}

const PLACEHOLDER = '—'

/** Describe the polled Controller state for the panel's read-only telemetry. */
export function describeControllerPanel({
  activeProgramId,
  programs,
  fps,
}: ControllerPanelTelemetry): ControllerPanelView {
  const match = activeProgramId
    ? programs.find((p) => p.id === activeProgramId)
    : undefined
  const patternName = match?.name ?? activeProgramId ?? PLACEHOLDER
  const fpsLabel = fps === null ? PLACEHOLDER : fps.toFixed(1)
  return { patternName, fpsLabel }
}

// ── live controls + watched vars (H7, issue #199) ────────────────────────────
// The device reports the running pattern's live controls and exported variables
// as flat name→value maps (no kind metadata). We recover each control's kind from
// the Pixelblaze naming convention — control functions are prefixed `slider…`,
// `toggle…`, `hsvPicker…`, `rgbPicker…` — the same prefixes `bundle.ts` parses on
// the preview side. Pickers carry triplets the flat numeric map can't express, so
// the panel renders the two numeric kinds (slider, toggle); an unknown prefix
// degrades to a slider rather than vanishing.

/** A single control to render on the Controller panel: device key, display label,
 *  the kind recovered from its name prefix, and its current value. */
export interface ControllerControl {
  /** The device-side control name (the key in `setControls`/`activeControls`). */
  name: string
  /** Display label derived from the name suffix (e.g. `sliderSpeed` → `speed`). */
  label: string
  /** Recovered control kind; only numeric kinds are surfaced. */
  kind: 'slider' | 'toggle'
  /** Current value (0..1 for sliders, 0/1 for toggles). */
  value: number
}

const KNOWN_PREFIXES = ['hsvPicker', 'rgbPicker', 'slider', 'toggle'] as const

function labelFromSuffix(suffix: string): string {
  return suffix.replace(/([A-Z])/g, ' $1').trim()
}

/** Shape the device's flat `activeControls` map into a list the panel can render.
 *  Kind is recovered from the name prefix; toggles render as checkboxes, everything
 *  else as a slider. Insertion order is preserved. */
export function shapeControllerControls(
  activeControls?: Record<string, number>,
): ControllerControl[] {
  if (!activeControls) return []
  const out: ControllerControl[] = []
  for (const [name, raw] of Object.entries(activeControls)) {
    if (typeof raw !== 'number') continue
    const prefix = KNOWN_PREFIXES.find((p) => name.startsWith(p) && name.length > p.length)
    const label = prefix ? labelFromSuffix(name.slice(prefix.length)) || name : name
    const kind = prefix === 'toggle' ? 'toggle' : 'slider'
    out.push({ name, label, kind, value: raw })
  }
  return out
}

/** A read-only watched variable: its name and a display-formatted value. */
export interface ControllerVarView {
  name: string
  value: string
}

function formatVarValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** Format the device's exported variables for the read-only watch list. Skips
 *  non-numeric values; preserves the device's reported order. */
export function describeControllerVars(
  vars?: Record<string, number>,
): ControllerVarView[] {
  if (!vars) return []
  const out: ControllerVarView[] = []
  for (const [name, value] of Object.entries(vars)) {
    if (typeof value !== 'number') continue
    out.push({ name, value: formatVarValue(value) })
  }
  return out
}
