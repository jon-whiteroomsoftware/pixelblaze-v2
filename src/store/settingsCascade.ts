// The per-pattern settings cascade wiring (ADR-0013) — the single place that
// composes the four layers into live store state and routes a control's manipulation
// to the correct layer. No React; orchestrates across the three stores + the pure
// engine resolver, so components stay thin and this stays unit-testable.
//
// Seed-and-mirror: `seedActiveSettings` runs ONCE per pattern-open to resolve every
// field and push it into the live working stores (mapStore.active* + previewStore
// live values). The renderer then reads those live values per frame as before —
// resolveSettings never touches a frame. Each control's change handler calls the
// matching writer here to persist its layer (cascaded override / hybrid / global).

import type { Settings, FidelityMode } from '@/engine/settings'
import { DEV_DEFAULTS } from '@/engine/settings'
import { resolveSettings, hybridWriteTarget } from '@/engine/resolveSettings'
import { recommendedSettingsFor } from '@/pixelblaze/demos'
import type { ShapeId } from '@/engine/shapes'
import type { SurfaceId } from '@/engine/surfaces'
import { usePatternStore } from './patternStore'
import { usePreviewStore } from './previewStore'
import { useMapStore } from './mapStore'

// The active pattern's persisted overrides (layer 1) — empty for a read-only demo,
// which carries no PatternRecord.
function activeOverrides(): Partial<Settings> {
  const ps = usePatternStore.getState()
  const id = ps.activePatternId
  const record = id ? ps.userPatterns.find((p) => p.id === id) : undefined
  return record?.settings ?? {}
}

// The live global-sticky layer (layer 3) read from previewStore.
function globalSticky(): { lightSize: number; diffusion: number; fidelity: FidelityMode } {
  const pv = usePreviewStore.getState()
  return { lightSize: pv.lightSizeSticky, diffusion: pv.diffusionSticky, fidelity: pv.fidelity }
}

// Resolve the effective settings for whatever is active (user pattern or demo),
// composing override → recommended → global-sticky → dev-default.
export function resolveActiveSettings(): Settings {
  const recommended = recommendedSettingsFor(usePatternStore.getState().activeDemoName)
  return resolveSettings(activeOverrides(), recommended, globalSticky(), DEV_DEFAULTS)
}

// Resolve the effective settings for a named demo, regardless of what's active. Used
// by the per-row demo fork (#182), which forks a demo without first opening it — so
// it can't rely on `activeDemoName`. No overrides (a demo has none); just the demo's
// recommendation over the global-sticky and dev-default layers.
export function resolveSettingsForDemo(demoName: string): Settings {
  return resolveSettings({}, recommendedSettingsFor(demoName), globalSticky(), DEV_DEFAULTS)
}

// Seed the live working stores from the resolved settings (open-time, ADR-0013).
// Replaces the former per-field hydrate/solidity effects. `fidelity` is pure-global
// (already live in previewStore), so it is not reseeded here.
export function seedActiveSettings(): void {
  const eff = resolveActiveSettings()
  const m = useMapStore.getState()
  m.setActiveMap(eff.mapId)
  m.setActiveShape(eff.shapeId as ShapeId)
  m.setActiveSurface(eff.surfaceId as SurfaceId)
  m.setActivePixelCount(eff.pixelCount)
  m.setActiveSolidity(eff.solidity)
  m.setActiveNormalizeMode(eff.normalize)
  const pv = usePreviewStore.getState()
  pv.setBrightness(eff.brightness)
  pv.setSpeed(eff.speed)
  pv.setLightSize(eff.lightSize)
  pv.setDiffusion(eff.diffusion)
}

// Write a per-pattern cascaded override (layer 1) for the active pattern. A demo has
// no record, so the override is simply skipped — the live store already reflects the
// value and a demo persists nothing (matching the pre-0013 behaviour).
export function writeCascadedOverride<K extends keyof Settings>(field: K, value: Settings[K]): void {
  const id = usePatternStore.getState().activePatternId
  if (id) void usePatternStore.getState().updatePatternSettings(id, { [field]: value })
}

// Route a hybrid comfort-pref drag (lightSize/diffusion) to the correct layer
// (ADR-0013): a per-pattern override when the pattern already has a recommendation or
// existing override, else the global-sticky baseline (set-once-stays-set). A demo
// (no record) always falls back to the global-sticky.
export function writeHybrid(field: 'lightSize' | 'diffusion', value: number): void {
  const ps = usePatternStore.getState()
  const id = ps.activePatternId
  const record = id ? ps.userPatterns.find((p) => p.id === id) : undefined
  const target = hybridWriteTarget({
    hasRecord: !!record,
    hasExistingOverride: record?.settings?.[field] !== undefined,
    hasRecommendation: recommendedSettingsFor(ps.activeDemoName)[field] !== undefined,
  })
  if (target === 'override' && id) {
    void ps.updatePatternSettings(id, { [field]: value })
  } else if (field === 'lightSize') {
    usePreviewStore.getState().setLightSizeSticky(value)
  } else {
    usePreviewStore.getState().setDiffusionSticky(value)
  }
}

// Snapshot the active demo's *effective* settings as a frozen layer-1 override copy
// for a fork (ADR-0013). Everything except `fidelity` is captured — `fidelity` is
// pure-global and never per-pattern. The fork carries no live pointer back to the
// demo: later changes to the demo's recommendations never reach this copy. Call this
// while the demo is still active (before `setActivePattern` flips state).
export function forkSettingsSnapshot(): Partial<Settings> {
  const { fidelity: _fidelity, ...rest } = resolveActiveSettings()
  return rest
}

// Same frozen snapshot for a named demo (per-row fork, #182), which forks without the
// demo being active. Captures every field except pure-global `fidelity`.
export function forkSettingsSnapshotForDemo(demoName: string): Partial<Settings> {
  const { fidelity: _fidelity, ...rest } = resolveSettingsForDemo(demoName)
  return rest
}

// "Reset to defaults" (ADR-0013): clear the active pattern's layer-1 overrides, then
// re-seed so the live preview drops back to recommended + global + dev-default. No-op
// without an active user pattern.
export async function resetActiveSettings(): Promise<void> {
  const id = usePatternStore.getState().activePatternId
  if (!id) return
  await usePatternStore.getState().resetPatternSettings(id)
  seedActiveSettings()
}
