import { useEffect, useState, useSyncExternalStore } from 'react'
import { clampPixelCount } from '@/engine/camera'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useEditorStore } from '@/store/editorStore'
import {
  describeControllerPanel,
  shapeControllerControls,
  describeControllerVars,
} from '@/engine/controllerPanelView'
import {
  DeckSection,
  DeckSectionHint,
  DeckGrid,
  DeckCell,
  DeckTelemetry,
  DeckStat,
} from '@/components/Deck'
import { DeckSlider } from '@/components/DeckSlider'

// The live Controller panel (H6, issue #198). A dashboard built from the *same*
// shared deck template as the preview control deck — read-only telemetry (active
// pattern, reported FPS) plus the panel-owned brightness slider. The Controller
// instance has fewer affordances than the preview deck: none of the preview-only
// settings (light size, grid, camera). H7 (#199) fills the same template with the
// device's user controls and a variable readout.
//
// Renders only while a Controller is connected — the polling store drives the
// live values; this is a thin presentational shell over it and the provider seam.

const PANEL_HINT = (
  <DeckSectionHint
    items={[
      ['pattern', 'the pattern the Controller is currently running'],
      ['brightness', 'master output level on the device — applied live'],
      ['map points', 'number of coordinates in the device’s installed pixel map'],
      ['pixel count', 'number of pixels configured on the device — editable; saved to the device so it survives a reboot'],
      ['IP', 'the device’s address on the local network'],
      ['fps', 'frame rate the device reports'],
    ]}
  />
)

// The pattern-controls help hint, built from whatever descriptions we have for the
// running pattern's controls (matched by name to the loaded pattern's metadata, #190).
// Mirrors the preview deck's pattern-controls hover: a label-keyed list of what each
// control does. Returns null when no control carries a description, so the caller can
// omit the help affordance entirely rather than show an empty "?".
function buildControlsHint(controls: { name: string; label: string; description?: string }[]) {
  if (!controls.some((c) => c.description)) return null
  return (
    <div className="flex flex-col gap-1.5 normal-case tracking-normal">
      {controls.map((c) => (
        <div key={c.name} className="leading-snug">
          <span className="text-zinc-200">{c.label}</span>
          {c.description && <span className="text-zinc-400"> — {c.description}</span>}
        </div>
      ))}
    </div>
  )
}

const VARS_HINT = (
  <DeckSectionHint
    intro="The running pattern's exported variables, read live from the device. Read-only — a watch window, not an editor."
    items={[['value', 'the variable’s current value on the device']]}
  />
)

// Editable pixel-count control (#213). Mirrors the preview deck's PixelCountInput —
// same draft/commit-on-Enter-or-blur logic and styling — but reads/writes the live
// Controller's pixel count. Unlike the preview's preview-only count this is real
// device config: committing it sends a saved `setPixelCount` to the device. Setting
// the count is also the remedy for an unconformable map push (a map only applies
// when its point count exactly matches the device's pixel count).
function ControllerPixelCountInput() {
  const pixelCount = useControllerPanelStore((s) => s.pixelCount)
  const setPixelCount = useControllerPanelStore((s) => s.setPixelCount)

  const [draft, setDraft] = useState(pixelCount == null ? '' : String(pixelCount))

  // Reflect external count changes (the device's reported value, polled) into the
  // draft by adjusting state during render — React's recommended pattern over an effect.
  const [lastCount, setLastCount] = useState(pixelCount)
  if (pixelCount !== lastCount) {
    setLastCount(pixelCount)
    setDraft(pixelCount == null ? '' : String(pixelCount))
  }

  function commit() {
    const parsed = parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      // Reject empty/garbage: snap back to the last known device count.
      setDraft(pixelCount == null ? '' : String(pixelCount))
      return
    }
    const n = clampPixelCount(parsed)
    setDraft(String(n))
    if (n !== pixelCount) setPixelCount(n)
  }

  return (
    <input
      aria-label="Controller pixel count"
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      onBlur={commit}
      className="w-[42px] h-5 px-0.5 rounded border border-zinc-500 text-[11px] tabular-nums text-zinc-300 text-center bg-transparent hover:border-zinc-400 focus:outline-none focus:border-live"
    />
  )
}

export function ControllerPanel() {
  // Re-render (and so re-subscribe to the active provider below) when the active
  // Controller changes — the panel is bound to the active Controller (#210).
  const activeIp = useControllerStore((s) => s.activeIp)
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const connected = status.kind === 'connected'

  const start = useControllerPanelStore((s) => s.start)
  const stop = useControllerPanelStore((s) => s.stop)
  // Poll only while connected; tear the polling down on disconnect/unmount. Keyed
  // on the active Controller so switching pills restarts polling against the new
  // device (a fresh seed of brightness/controls) rather than fighting stale state.
  useEffect(() => {
    if (!connected) return
    start(activeIp ?? undefined)
    return () => stop()
  }, [connected, activeIp, start, stop])

  const brightness = useControllerPanelStore((s) => s.brightness)
  const activeProgramId = useControllerPanelStore((s) => s.activeProgramId)
  const programs = useControllerPanelStore((s) => s.programs)
  const fps = useControllerPanelStore((s) => s.fps)
  const pixelCount = useControllerPanelStore((s) => s.pixelCount)
  const mapPointCount = useControllerPanelStore((s) => s.mapPointCount)
  const activeControls = useControllerPanelStore((s) => s.activeControls)
  const vars = useControllerPanelStore((s) => s.vars)
  const setBrightness = useControllerPanelStore((s) => s.setBrightness)
  const setControl = useControllerPanelStore((s) => s.setControl)
  // Control help text isn't reported by the device; borrow it from the loaded
  // pattern's metadata, matched by control name (#190). When the editor holds a
  // different pattern (or a user/imported one with no descriptions) nothing matches
  // and the controls section shows no help affordance at all.
  const editorControls = useEditorStore((s) => s.controls)

  if (!connected) return null

  const controlDescriptions: Record<string, string> = {}
  for (const c of editorControls) {
    if (c.description) controlDescriptions[c.exportName] = c.description
  }

  const { patternName, fpsLabel, pixelsLabel, mapPointsLabel, mapCountMismatch } =
    describeControllerPanel({
      activeProgramId,
      programs,
      fps,
      pixelCount,
      mapPointCount,
    })
  const controls = shapeControllerControls(activeControls, controlDescriptions)
  const controlsHint = buildControlsHint(controls)
  const watchedVars = describeControllerVars(vars)

  return (
    <div className="font-mono pl-3 text-xs" data-testid="controller-panel">
      <DeckSection label="Pixelblaze" hint={PANEL_HINT}>
        <DeckGrid gapY="gap-y-2">
          {/* Row 1: pattern + brightness, both stacked for the width they need. */}
          <DeckStat label="pattern" value={patternName} />
          <DeckSlider
            label="brightness"
            ariaLabel="Controller brightness"
            value={brightness ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={setBrightness}
          />
          {/* Row 2: map points + pixel count. */}
          <DeckCell label="map points">
            <span
              className={`tabular-nums truncate ${mapCountMismatch ? 'text-amber-400' : 'text-live'}`}
              title={
                mapCountMismatch
                  ? `Map has ${mapPointsLabel} points but the Controller has ${pixelsLabel} pixels — the firmware silently drops a mismatched map (#204).`
                  : undefined
              }
              data-testid="controller-map-points"
            >
              {mapPointsLabel}
            </span>
          </DeckCell>
          <DeckCell label="pixel count">
            <ControllerPixelCountInput />
          </DeckCell>
          {/* Row 3: IP + fps. */}
          <DeckTelemetry label="IP" value={status.controller.address} />
          <DeckTelemetry label="fps" value={fpsLabel} />
        </DeckGrid>
      </DeckSection>

      {controls.length > 0 && (
        <DeckSection label="pattern controls" hint={controlsHint ?? undefined}>
          <DeckGrid>
            {controls.map((c) =>
              c.kind === 'toggle' ? (
                <DeckCell key={c.name} label={c.label.toLowerCase()}>
                  <input
                    type="checkbox"
                    aria-label={c.name}
                    checked={c.value === 1}
                    onChange={(e) => setControl(c.name, e.target.checked ? 1 : 0)}
                    className="accent-live shrink-0"
                  />
                </DeckCell>
              ) : (
                <DeckSlider
                  key={c.name}
                  label={c.label.toLowerCase()}
                  ariaLabel={c.name}
                  value={c.value}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => setControl(c.name, v)}
                />
              ),
            )}
          </DeckGrid>
        </DeckSection>
      )}

      {watchedVars.length > 0 && (
        <DeckSection label="variables" hint={VARS_HINT}>
          <DeckGrid gapY="gap-y-1">
            {watchedVars.map((v) => (
              <DeckTelemetry key={v.name} label={v.name} value={v.value} />
            ))}
          </DeckGrid>
        </DeckSection>
      )}
    </div>
  )
}
