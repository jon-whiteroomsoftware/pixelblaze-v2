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
  /** Per-program label cache for this Controller (program id → label) populated on
   *  push (#237). Resolves the name of a run-only program that never enters the
   *  device's program list, so the panel shows the IDE pattern's name instead of the
   *  raw generated id. Absent/empty until a push records a label. */
  programLabels?: Record<string, string>
  /** Device-reported frame rate; `null` until a frame rate has been reported. */
  fps: number | null
  /** The device's configured pixel count; `null`/absent until read. Editable from
   *  the panel via `setPixelCount` (#213). */
  pixelCount?: number | null
  /** Number of coordinates in the device's installed pixel map, read back over the
   *  provider seam (H13, #205); `null`/absent until read, or when the device has no
   *  map. Surfacing it next to `pixelCount` makes the #204-class mismatch (a map
   *  whose count != pixelCount is silently dropped) visible at a glance. */
  mapPointCount?: number | null
}

export interface ControllerPanelView {
  /** Human label for the active pattern: device-list name, else the local label
   *  cache, else the raw id, else '—'. */
  patternName: string
  /** True when `patternName` came from the local label cache rather than the device's
   *  program list — i.e. the program is running but not saved on the device (a run-only
   *  push). Lets the panel mark the running-but-unsaved state honestly instead of having
   *  it read identical to a saved pattern. */
  patternUnsaved: boolean
  /** FPS to one decimal, or '—' when not yet reported. */
  fpsLabel: string
  /** Pixel count as an integer string, or '—' when not yet read. */
  pixelsLabel: string
  /** Installed-map point count as an integer string, or '—' when not yet read /
   *  the device has no map. */
  mapPointsLabel: string
  /** True when both counts are known and disagree — the silent-drop footgun (#204).
   *  The panel can flag this so a stale/mismatched map is visible, not invisible. */
  mapCountMismatch: boolean
}

const PLACEHOLDER = '—'

/** Resolve the active program's display name through three tiers: the device's
 *  program list (a saved program) → the local label cache (a run-only push we made)
 *  → the raw id (a program we know nothing about). `unsaved` is true only for the
 *  middle tier — the name is ours but the device hasn't saved it. Pure (#237). */
export function resolveActiveProgramName(
  activeProgramId: string | undefined,
  programs: ProgramListEntry[],
  programLabels?: Record<string, string>,
): { patternName: string; patternUnsaved: boolean } {
  if (!activeProgramId) return { patternName: PLACEHOLDER, patternUnsaved: false }
  const listed = programs.find((p) => p.id === activeProgramId)
  if (listed) return { patternName: listed.name, patternUnsaved: false }
  const cached = programLabels?.[activeProgramId]
  if (cached) return { patternName: cached, patternUnsaved: true }
  return { patternName: activeProgramId, patternUnsaved: false }
}

/** Describe the polled Controller state for the panel's read-only telemetry. */
export function describeControllerPanel({
  activeProgramId,
  programs,
  programLabels,
  fps,
  pixelCount,
  mapPointCount,
}: ControllerPanelTelemetry): ControllerPanelView {
  const { patternName, patternUnsaved } = resolveActiveProgramName(
    activeProgramId,
    programs,
    programLabels,
  )
  const fpsLabel = fps === null ? PLACEHOLDER : fps.toFixed(1)
  const pixelsLabel = pixelCount == null ? PLACEHOLDER : String(pixelCount)
  const mapPointsLabel = mapPointCount == null ? PLACEHOLDER : String(mapPointCount)
  const mapCountMismatch =
    pixelCount != null && mapPointCount != null && pixelCount !== mapPointCount
  return { patternName, patternUnsaved, fpsLabel, pixelsLabel, mapPointsLabel, mapCountMismatch }
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
  /** End-user description of the control, when known. The device reports controls
   *  without descriptions, so this is supplied by the caller (matched by name to the
   *  loaded pattern's metadata, #190) and is absent for user/imported patterns. */
  description?: string
}

const KNOWN_PREFIXES = ['hsvPicker', 'rgbPicker', 'slider', 'toggle'] as const

function labelFromSuffix(suffix: string): string {
  return suffix.replace(/([A-Z])/g, ' $1').trim()
}

/** Shape the device's flat `activeControls` map into a list the panel can render.
 *  Kind is recovered from the name prefix; toggles render as checkboxes, everything
 *  else as a slider. Insertion order is preserved. An optional `descriptions` lookup
 *  (control name → text) attaches end-user help when the loaded pattern's metadata
 *  carries it (#190); names with no entry simply omit the description. */
export function shapeControllerControls(
  activeControls?: Record<string, number>,
  descriptions?: Record<string, string>,
): ControllerControl[] {
  if (!activeControls) return []
  const out: ControllerControl[] = []
  for (const [name, raw] of Object.entries(activeControls)) {
    if (typeof raw !== 'number') continue
    const prefix = KNOWN_PREFIXES.find((p) => name.startsWith(p) && name.length > p.length)
    const label = prefix ? labelFromSuffix(name.slice(prefix.length)) || name : name
    const kind = prefix === 'toggle' ? 'toggle' : 'slider'
    const description = descriptions?.[name]?.trim() || undefined
    out.push({ name, label, kind, value: raw, description })
  }
  return out
}

/** The position to show for a slider control, or `null` when the device's reported
 *  value is unusable as a 0..1 position — so the panel shows an *unset* slider rather
 *  than a misleading bar.
 *
 *  Pixelblaze sliders are 0..1, but the live `activeProgram.controls` map reports the
 *  control's bound *variable*, not its UI position. Patterns that bind a slider to an
 *  exported var the render loop also mutates (e.g. an accumulator) report wildly
 *  out-of-range values — `sliderOctaves: 2.37e+21`, `sliderZoom: 1.98` — and the
 *  stored controls (`getControls`) are empty for a run-only program, so there is no
 *  clean position to recover (#speed-slider, verified on hardware 2026-06-05). Treat
 *  anything outside [0,1] (or non-finite) as unset; the user sets it by dragging. */
export function controllerSliderValue(raw: number): number | null {
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null
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
