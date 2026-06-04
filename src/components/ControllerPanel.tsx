import { useEffect, useSyncExternalStore } from 'react'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import {
  describeControllerPanel,
  shapeControllerControls,
  describeControllerVars,
} from '@/engine/controllerPanelView'
import { DeckSection, DeckSectionHint, DeckGrid, DeckCell, DeckTelemetry } from '@/components/Deck'
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
    intro="Live state read from the connected Pixelblaze. Brightness is sent to the device immediately and is not persisted to flash."
    items={[
      ['pattern', 'the pattern the Controller is currently running'],
      ['fps', 'frame rate the device reports'],
      ['pixels', 'pixel count configured on the device — fixed to its wiring'],
      ['brightness', 'master output level on the device — applied live'],
    ]}
  />
)

const CONTROLS_HINT = (
  <DeckSectionHint
    intro="The running pattern's UI controls, read live from the device. Changes are sent to the Controller immediately and are not persisted to flash."
    items={[
      ['sliders', 'continuous values the pattern exposes — applied live'],
      ['toggles', 'on/off switches the pattern exposes — applied live'],
    ]}
  />
)

const VARS_HINT = (
  <DeckSectionHint
    intro="The running pattern's exported variables, read live from the device. Read-only — a watch window, not an editor."
    items={[['value', 'the variable’s current value on the device']]}
  />
)

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
    start()
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

  if (!connected) return null

  const { patternName, fpsLabel, pixelsLabel, mapPointsLabel, mapCountMismatch } =
    describeControllerPanel({
      activeProgramId,
      programs,
      fps,
      pixelCount,
      mapPointCount,
    })
  const controls = shapeControllerControls(activeControls)
  const watchedVars = describeControllerVars(vars)
  // The section header carries the Controller's identity (device name, else its address).
  const label = status.controller.name ?? status.controller.address

  return (
    <div className="font-mono pl-3 text-xs" data-testid="controller-panel">
      <DeckSection label={label} hint={PANEL_HINT}>
        <DeckGrid gapY="gap-y-1" className="mb-2">
          <DeckTelemetry label="pattern" value={patternName} />
          <DeckTelemetry label="fps" value={fpsLabel} />
          <DeckTelemetry label="pixels" value={pixelsLabel} />
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
        </DeckGrid>
        <DeckGrid>
          <DeckSlider
            label="brightness"
            ariaLabel="Controller brightness"
            value={brightness ?? 0}
            min={0}
            max={1}
            step={0.01}
            onChange={setBrightness}
          />
        </DeckGrid>
      </DeckSection>

      {controls.length > 0 && (
        <DeckSection label="controls" hint={CONTROLS_HINT}>
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
