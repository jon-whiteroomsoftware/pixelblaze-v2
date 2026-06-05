import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
  CONTROLLER_POLL_INTERVAL_MS,
} from './controllerPanelStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'

class FakeProvider extends NullControllerProvider {
  config: ControllerConfig = { brightness: 0.5, activeProgramId: 'def' }
  telemetry: ControllerTelemetry = { fps: 30 }
  programs: ProgramListEntry[] = [
    { id: 'abc', name: 'Aurora' },
    { id: 'def', name: 'Nebula' },
  ]
  vars: Record<string, number> = { phase: 0.5 }
  brightnessWrites: Array<{ value: number; save: boolean }> = []
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
  controlWrites: Array<{ controls: Record<string, number>; save: boolean }> = []
  installedMap: number[][] | null = null
  mapWrites: number[][][] = []

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve(this.config)
  }
  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve(this.telemetry)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  getVars(): Promise<Record<string, number>> {
    return Promise.resolve(this.vars)
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
  setPixelCount(value: number, save = true): Promise<void> {
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(this.installedMap)
  }
  setPixelMap(points: number[][]): Promise<void> {
    this.mapWrites.push(points)
    this.installedMap = points
    return Promise.resolve()
  }
}

let provider: FakeProvider

beforeEach(() => {
  vi.useFakeTimers()
  provider = new FakeProvider()
  setControllerProvider(provider)
  useControllerPanelStore.setState(controllerPanelInitialState)
})

afterEach(() => {
  useControllerPanelStore.getState().stop()
  vi.useRealTimers()
  resetControllerProvider()
})

// Flush microtasks queued by the polled promises.
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('controllerPanelStore', () => {
  it('start() polls config + telemetry and fetches the program list', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.brightness).toBe(0.5)
    expect(s.activeProgramId).toBe('def')
    expect(s.fps).toBe(30)
    expect(s.programs).toHaveLength(2)
  })

  it('seed() warms config + telemetry + program list without starting the interval', async () => {
    useControllerPanelStore.getState().seed()
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.brightness).toBe(0.5)
    expect(s.activeProgramId).toBe('def')
    expect(s.fps).toBe(30)
    expect(s.programs).toHaveLength(2)
    // No interval was started: a later device change is not picked up.
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })

  it('reads the installed map point count once on start (#205)', async () => {
    provider.getPixelMap = () =>
      Promise.resolve([
        [0, 0],
        [1, 1],
        [0.5, 0.5],
      ])
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().mapPointCount).toBe(3)
  })

  it('leaves the map point count null when the device has no map', async () => {
    provider.getPixelMap = () => Promise.resolve(null)
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().mapPointCount).toBeNull()
  })

  it('keeps polling on the interval', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    provider.telemetry = { fps: 45 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().fps).toBe(45)
  })

  it('seeds brightness once and does not overwrite it on later polls', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().brightness).toBe(0.5)
    // Device later reports a different brightness; the panel slider owns it now.
    provider.config = { brightness: 0.9, activeProgramId: 'def' }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().brightness).toBe(0.5)
  })

  it('polls the running pattern controls and watched vars', async () => {
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    useControllerPanelStore.getState().start()
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.activeControls).toEqual({ sliderSpeed: 0.3 })
    expect(s.vars).toEqual({ phase: 0.5 })
  })

  it('keeps controls slider-owned until the active pattern changes', async () => {
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    useControllerPanelStore.getState().start()
    await flush()
    // Local edit; later poll for the SAME pattern must not clobber it.
    useControllerPanelStore.getState().setControl('sliderSpeed', 0.8)
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderSpeed: 0.8 })
    // A pattern switch reseeds from the device.
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'abc',
      activeControls: { sliderHue: 0.1 },
    }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderHue: 0.1 })
  })

  it('setControl writes through volatile (never save:true) and updates locally', () => {
    useControllerPanelStore.getState().setControl('sliderSpeed', 0.7)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderSpeed: 0.7 })
    expect(provider.controlWrites).toEqual([{ controls: { sliderSpeed: 0.7 }, save: false }])
  })

  it('setBrightness writes through volatile (never save:true) and updates locally', () => {
    useControllerPanelStore.getState().setBrightness(0.25)
    expect(useControllerPanelStore.getState().brightness).toBe(0.25)
    expect(provider.brightnessWrites).toEqual([{ value: 0.25, save: false }])
  })

  it('setPixelCount persists the count (save:true) and updates locally', async () => {
    // prev is unknown (null) here, so no reduction can be inferred — just a write.
    useControllerPanelStore.getState().setPixelCount(16)
    expect(useControllerPanelStore.getState().pixelCount).toBe(16)
    await flush()
    expect(provider.pixelCountWrites).toEqual([{ value: 16, save: true }])
    expect(provider.brightnessWrites).toEqual([])
  })

  it('reducing the count blacks out the strip, then restores brightness (#222)', async () => {
    // Driving the strip black before shrinking is the only way to darken the tail
    // LEDs (verified on hardware); brightness returns to the device's reported value.
    useControllerPanelStore.setState({ pixelCount: 4 })
    useControllerPanelStore.getState().setPixelCount(2)
    await vi.advanceTimersByTimeAsync(400)
    expect(provider.brightnessWrites).toEqual([
      { value: 0, save: false },
      { value: 0.5, save: false },
    ])
    expect(provider.pixelCountWrites).toEqual([{ value: 2, save: true }])
  })

  it('raising the count just writes it — no blackout (#222)', async () => {
    useControllerPanelStore.setState({ pixelCount: 2 })
    useControllerPanelStore.getState().setPixelCount(8)
    await flush()
    expect(provider.pixelCountWrites).toEqual([{ value: 8, save: true }])
    expect(provider.brightnessWrites).toEqual([])
  })

  it('stop() halts polling but keeps the last values for a seamless reopen', async () => {
    useControllerPanelStore.getState().start('1.2.3.4')
    await flush()
    expect(useControllerPanelStore.getState().fps).toBe(30)
    useControllerPanelStore.getState().stop()
    // State is preserved (no blank flash on reopen), but no further polls run.
    expect(useControllerPanelStore.getState().fps).toBe(30)
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })

  it('reopening the same device keeps values; a different device clears them first', async () => {
    useControllerPanelStore.getState().start('1.2.3.4')
    await flush()
    useControllerPanelStore.getState().stop()

    // Reopen the SAME device: values survive into the new session immediately.
    useControllerPanelStore.getState().start('1.2.3.4')
    expect(useControllerPanelStore.getState().fps).toBe(30)
    await flush()
    useControllerPanelStore.getState().stop()

    // Open a DIFFERENT device: stale values are cleared before the warm fetch lands.
    useControllerPanelStore.getState().start('5.6.7.8')
    expect(useControllerPanelStore.getState().fps).toBeNull()
    await flush()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })

  it('tolerates a failing poll without throwing', async () => {
    provider.getConfig = () => Promise.reject(new Error('dropped'))
    useControllerPanelStore.getState().start()
    await expect(flush()).resolves.not.toThrow()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })
})
