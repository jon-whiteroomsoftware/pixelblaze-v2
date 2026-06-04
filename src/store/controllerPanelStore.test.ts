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

  it('setPixelCount writes through saved (save:true) and updates locally', () => {
    useControllerPanelStore.getState().setPixelCount(16)
    expect(useControllerPanelStore.getState().pixelCount).toBe(16)
    expect(provider.pixelCountWrites).toEqual([{ value: 16, save: true }])
  })

  it('stop() halts polling and resets state', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    useControllerPanelStore.getState().stop()
    expect(useControllerPanelStore.getState()).toMatchObject(controllerPanelInitialState)
    // No further polls after stop.
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('tolerates a failing poll without throwing', async () => {
    provider.getConfig = () => Promise.reject(new Error('dropped'))
    useControllerPanelStore.getState().start()
    await expect(flush()).resolves.not.toThrow()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })
})
