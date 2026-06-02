import { beforeEach, describe, it, expect } from 'vitest'
import { usePatternStore, patternInitialState } from './patternStore'
import { usePreviewStore, previewInitialState } from './previewStore'
import { useMapStore, mapInitialState } from './mapStore'
import {
  resolveActiveSettings,
  seedActiveSettings,
  writeCascadedOverride,
  writeHybrid,
  forkSettingsSnapshot,
  forkSettingsSnapshotForDemo,
} from './settingsCascade'

beforeEach(() => {
  usePatternStore.setState(patternInitialState)
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
})

function seedPattern(settings?: Record<string, unknown>) {
  usePatternStore.setState({
    activePatternId: 'p1',
    activeDemoName: null,
    userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings }],
  })
}

describe('resolveActiveSettings', () => {
  it('falls back to dev-defaults for a bare pattern', () => {
    seedPattern()
    const eff = resolveActiveSettings()
    expect(eff.brightness).toBe(1)
    expect(eff.mapId).toBe('plane')
  })

  it('applies a per-pattern override over the dev-default', () => {
    seedPattern({ brightness: 0.4, mapId: 'cube' })
    const eff = resolveActiveSettings()
    expect(eff.brightness).toBe(0.4)
    expect(eff.mapId).toBe('cube')
  })

  it('uses the global-sticky baseline for an untouched hybrid field', () => {
    seedPattern()
    usePreviewStore.setState({ lightSizeSticky: 0.8 })
    expect(resolveActiveSettings().lightSize).toBe(0.8)
  })

  it('applies a demo recommendation when a demo is active', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    const eff = resolveActiveSettings()
    expect(eff.mapId).toBe('seed-sphere-3d')
    expect(eff.pixelCount).toBe(4096)
    expect(eff.solidity).toBe(1)
  })
})

describe('seedActiveSettings', () => {
  it('pushes resolved values into the live stores', () => {
    seedPattern({ mapId: 'cube', pixelCount: 512, brightness: 0.5 })
    seedActiveSettings()
    expect(useMapStore.getState().activeMapId).toBe('cube')
    expect(useMapStore.getState().activePixelCount).toBe(512)
    expect(usePreviewStore.getState().brightness).toBe(0.5)
  })
})

describe('writeCascadedOverride', () => {
  it('persists a sparse override on the active pattern', () => {
    seedPattern()
    writeCascadedOverride('brightness', 0.3)
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ brightness: 0.3 })
  })

  it('is a no-op for a read-only demo (no record to hold an override)', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    expect(() => writeCascadedOverride('brightness', 0.3)).not.toThrow()
    expect(usePatternStore.getState().userPatterns).toHaveLength(0)
  })
})

describe('fork snapshot', () => {
  it('captures the active demo effective settings, omitting pure-global fidelity', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    const snap = forkSettingsSnapshot()
    expect(snap.mapId).toBe('seed-sphere-3d')
    expect(snap.pixelCount).toBe(4096)
    expect(snap.solidity).toBe(1)
    expect('fidelity' in snap).toBe(false)
  })

  it('snapshots a named demo regardless of what is active', () => {
    // A different demo is "active"; the per-row fork still resolves by name.
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    const snap = forkSettingsSnapshotForDemo('NebulaSphere')
    expect(snap.mapId).toBe('seed-sphere-3d')
    expect(snap.pixelCount).toBe(8192)
    expect('fidelity' in snap).toBe(false)
  })
})

describe('writeHybrid', () => {
  it('writes the global-sticky baseline for a plain pattern with no recommendation or override', () => {
    seedPattern()
    writeHybrid('lightSize', 0.9)
    expect(usePreviewStore.getState().lightSizeSticky).toBe(0.9)
    expect(usePatternStore.getState().userPatterns[0].settings ?? {}).toEqual({})
  })

  it('writes a per-pattern override once the pattern already has one', () => {
    seedPattern({ lightSize: 0.4 })
    writeHybrid('lightSize', 0.6)
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({ lightSize: 0.6 })
    // The global baseline is untouched.
    expect(usePreviewStore.getState().lightSizeSticky).toBe(previewInitialState.lightSizeSticky)
  })

  it('falls back to the global-sticky for a read-only demo (no record)', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    writeHybrid('diffusion', 0.25)
    expect(usePreviewStore.getState().diffusionSticky).toBe(0.25)
  })
})
