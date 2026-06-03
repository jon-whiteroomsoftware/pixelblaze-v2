import { create } from 'zustand'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'

// Polling orchestration for the live Controller panel (H6, issue #198).
//
// While a Controller is connected the panel mirrors a small slice of live device
// state: the active pattern (id, resolved to a name via the program list) and the
// reported FPS — both read-only — plus a volatile brightness slider. This store
// owns the polling lifecycle; the panel component calls start() while status is
// `connected` and stop() otherwise. Pure orchestration over the ControllerProvider
// seam — zero React, zero transport specifics.
//
// Brightness is *panel-owned and volatile* (never inherited from the preview,
// never persisted to flash — `save:false` always, mindful of flash wear). It is
// seeded once from the device's first reported value, then the slider owns it:
// later polls deliberately do not overwrite it, so a scrub never fights the poll.

export const CONTROLLER_POLL_INTERVAL_MS = 1000

interface ControllerPanelState {
  /** Last read brightness (0..1), seeded once then slider-owned. null until read. */
  brightness: number | null
  /** Id of the Controller's active program, resolved to a name by the panel view. */
  activeProgramId?: string
  /** The Controller's program list, fetched once on start for id→name resolution. */
  programs: ProgramListEntry[]
  /** Device-reported frame rate; null until reported. */
  fps: number | null
  /** The device's configured pixel count, read-only; null until read. */
  pixelCount: number | null
  /** The running pattern's live controls (name → value). Seeded from the device,
   *  then slider-owned until the active pattern changes (so a scrub never fights
   *  the poll); reseeded when `activeProgramId` changes. */
  activeControls: Record<string, number>
  /** The running pattern's exported variables (name → value), read-only. Refreshed
   *  every poll. */
  vars: Record<string, number>
  /** Begin polling (idempotent). Fetches the program list once, then polls config
   *  + telemetry + vars on the interval. */
  start: () => void
  /** Stop polling and reset to the disconnected baseline. */
  stop: () => void
  /** One poll tick: read config + telemetry + vars, tolerating transient failures. */
  poll: () => Promise<void>
  /** Set brightness on the device — volatile, never `save:true`. Optimistic local. */
  setBrightness: (value: number) => void
  /** Set one control value on the device — volatile, never `save:true`. Optimistic. */
  setControl: (name: string, value: number) => void
}

export const controllerPanelInitialState = {
  brightness: null,
  activeProgramId: undefined,
  programs: [] as ProgramListEntry[],
  fps: null,
  pixelCount: null,
  activeControls: {} as Record<string, number>,
  vars: {} as Record<string, number>,
}

// Interval handle kept module-local (not in store state) so it never serializes
// and a stale render never holds a timer reference.
let pollTimer: ReturnType<typeof setInterval> | null = null

// Which program's controls the local `activeControls` currently belong to. Kept
// module-local (bookkeeping, not rendered): the poll adopts the device's controls
// when this differs from the reported active program, then leaves them slider-owned.
let controlsSeededFor: string | undefined

export const useControllerPanelStore = create<ControllerPanelState>()((set, get) => ({
  ...controllerPanelInitialState,

  start: () => {
    if (pollTimer !== null) return
    controlsSeededFor = undefined
    // Program names rarely change; fetch the list once and tolerate failure.
    getControllerProvider()
      .listPrograms()
      .then((programs) => set({ programs }))
      .catch(() => {})
    void get().poll()
    pollTimer = setInterval(() => void get().poll(), CONTROLLER_POLL_INTERVAL_MS)
  },

  stop: () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    controlsSeededFor = undefined
    set(controllerPanelInitialState)
  },

  poll: async () => {
    const provider = getControllerProvider()
    const [config, telemetry, vars] = await Promise.all([
      provider.getConfig().catch(() => null),
      provider.getTelemetry().catch(() => null),
      provider.getVars().catch(() => null),
    ])
    if (config) {
      set((s) => {
        // Reseed the controls only when the device's active pattern changes; in
        // between, the slider owns them so a scrub never fights the poll.
        const reseed = config.activeProgramId !== controlsSeededFor
        if (reseed) controlsSeededFor = config.activeProgramId
        return {
          activeProgramId: config.activeProgramId,
          // Seed brightness once (?? on the existing value), then slider-owned.
          brightness: s.brightness ?? config.brightness ?? null,
          // Pixel count is fixed to the device's wiring; refresh it whenever
          // reported, falling back to the last known value.
          pixelCount: config.pixelCount ?? s.pixelCount,
          activeControls: reseed ? config.activeControls ?? {} : s.activeControls,
        }
      })
    }
    if (telemetry) set({ fps: telemetry.fps })
    if (vars) set({ vars })
  },

  setBrightness: (value) => {
    set({ brightness: value })
    void getControllerProvider()
      .setBrightness(value, false)
      .catch(() => {})
  },

  setControl: (name, value) => {
    set((s) => ({ activeControls: { ...s.activeControls, [name]: value } }))
    void getControllerProvider()
      .setControls({ [name]: value }, false)
      .catch(() => {})
  },
}))
