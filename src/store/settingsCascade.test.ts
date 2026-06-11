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
  resetActiveSettings,
  hasActiveOverrides,
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
    expect(eff.pixelCount).toBe(2048)
    expect(eff.solidity).toBe(0.08)
    expect(eff.brightness).toBe(1)
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

  it('persists a per-demo override in the keyed demoOverrides bag', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    writeCascadedOverride('brightness', 0.3)
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({ brightness: 0.3 })
    // The override outranks the recommendation on the next resolve.
    expect(resolveActiveSettings().brightness).toBe(0.3)
  })
})

describe('fork snapshot', () => {
  it('captures the active demo effective settings, omitting pure-global fidelity', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    const snap = forkSettingsSnapshot()
    expect(snap.mapId).toBe('seed-sphere-3d')
    expect(snap.pixelCount).toBe(2048)
    expect(snap.solidity).toBe(0.08)
    expect('fidelity' in snap).toBe(false)
  })

  it('snapshots a named demo regardless of what is active', () => {
    // A different demo is "active"; the per-row fork still resolves by name.
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    const snap = forkSettingsSnapshotForDemo('NebulaSphere')
    expect(snap.mapId).toBe('seed-sphere-3d')
    expect(snap.pixelCount).toBe(1024)
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

  it('writes the global-sticky for a demo with no recommendation or override for the field', () => {
    // A demo with no recommendation falls back to the global comfort baseline.
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'UnrecommendedDemo', userPatterns: [] })
    writeHybrid('diffusion', 0.25)
    expect(usePreviewStore.getState().diffusionSticky).toBe(0.25)
    expect(usePatternStore.getState().demoOverrides.UnrecommendedDemo ?? {}).toEqual({})
  })

  it('writes a per-demo override once the demo already has one for the field', () => {
    usePatternStore.setState({
      activePatternId: null,
      activeDemoName: 'AuroraSphere',
      userPatterns: [],
      demoOverrides: { AuroraSphere: { lightSize: 0.4 } },
    })
    writeHybrid('lightSize', 0.6)
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toEqual({ lightSize: 0.6 })
    expect(usePreviewStore.getState().lightSizeSticky).toBe(previewInitialState.lightSizeSticky)
  })
})

describe('resolveActiveSettings — demo overrides', () => {
  it('layers a persisted demo override over the recommendation', () => {
    usePatternStore.setState({
      activePatternId: null,
      activeDemoName: 'AuroraSphere',
      userPatterns: [],
      demoOverrides: { AuroraSphere: { pixelCount: 1000 } },
    })
    const eff = resolveActiveSettings()
    expect(eff.pixelCount).toBe(1000) // override beats recommended 2048
    expect(eff.mapId).toBe('seed-sphere-3d') // unspecified field still from recommendation
  })
})

describe('resetActiveSettings', () => {
  it('clears a user pattern back to dev-defaults', async () => {
    seedPattern({ brightness: 0.2, mapId: 'cube' })
    await resetActiveSettings()
    expect(usePatternStore.getState().userPatterns[0].settings).toEqual({})
    expect(usePreviewStore.getState().brightness).toBe(1)
    expect(useMapStore.getState().activeMapId).toBe('plane')
  })

  it('reverts a demo to its recommendation, leaving the global-sticky comfort prefs alone', async () => {
    usePreviewStore.setState({ lightSizeSticky: 0.7 })
    usePatternStore.setState({
      activePatternId: null,
      activeDemoName: 'AuroraSphere',
      userPatterns: [],
      demoOverrides: { AuroraSphere: { pixelCount: 1000, lightSize: 0.3 } },
    })
    await resetActiveSettings()
    expect(usePatternStore.getState().demoOverrides.AuroraSphere).toBeUndefined()
    // Back to the recommendation…
    expect(useMapStore.getState().activePixelCount).toBe(2048)
    expect(usePreviewStore.getState().lightSize).toBe(0.85)
    // …but the personal light-size baseline (global-sticky) is untouched.
    expect(usePreviewStore.getState().lightSizeSticky).toBe(0.7)
  })
})

describe('hasActiveOverrides', () => {
  it('is false for a clean pattern and true once an override exists', () => {
    seedPattern()
    expect(hasActiveOverrides()).toBe(false)
    seedPattern({ brightness: 0.5 })
    expect(hasActiveOverrides()).toBe(true)
  })

  it('tracks a demo override bag', () => {
    usePatternStore.setState({ activePatternId: null, activeDemoName: 'AuroraSphere', userPatterns: [] })
    expect(hasActiveOverrides()).toBe(false)
    usePatternStore.setState({ demoOverrides: { AuroraSphere: { brightness: 0.5 } } })
    expect(hasActiveOverrides()).toBe(true)
  })
})
