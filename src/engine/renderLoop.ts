import type { PatternHandle } from './loadPattern'
import type { ShimContext } from './shim'
import type { VirtualClock } from './virtualClock'

export interface RenderLoopConfig {
  handle: PatternHandle
  shim: ShimContext
  clock: VirtualClock
  grid: { rows: number; cols: number }
  getSpeed: () => number
  getBrightness: () => number
  isDimmed: () => boolean
  paint: (pixels: [number, number, number][], brightness: number, dimmed: boolean) => void
  onError?: (err: Error) => void
  onFrame?: (delta: number, builtins: Record<string, unknown>, elapsedMs: number) => void
  /**
   * Reports a smoothed frames-per-second figure, averaged over a ~500ms window
   * so the readout it feeds doesn't flicker. Only fires while the rAF loop runs
   * (not for one-off preview frames).
   */
  onFps?: (fps: number) => void
}

// Minimum real-time span to average FPS over before reporting. Doubles as the
// max update cadence for the readout (~2 updates/sec), which keeps it legible.
const FPS_WINDOW_MS = 500

export interface RenderLoop {
  start(): void
  stop(): void
  tick(realDelta: number): void
  renderPreviewFrame(): void
}

export function createRenderLoop(config: RenderLoopConfig): RenderLoop {
  const { handle, shim, clock, grid, getSpeed, getBrightness, isDimmed, paint } = config
  let rafId: number | null = null
  let lastTs: number | null = null
  let fpsWindowStart: number | null = null
  let fpsFrames = 0

  function doTick(realDelta: number, dimmed: boolean): void {
    const scaledDelta = realDelta * getSpeed()
    clock.advance(scaledDelta)
    // delta and index cross the engine→pattern boundary as scalars, so they
    // must be encoded to the active numeric domain (raw int32 in fidelity mode).
    handle.beforeRender(shim.encodeScalar(scaledDelta))

    const { rows, cols } = grid
    const pixels: [number, number, number][] = []

    for (let row = 0; row < rows; row++) {
      const y = rows === 1 ? 0 : row / (rows - 1)
      for (let col = 0; col < cols; col++) {
        const x = cols === 1 ? 0 : col / (cols - 1)
        // Apply the pattern's coordinate transform stack before render2D, so
        // translate/rotate/scale behave as on hardware.
        const [tx, ty] = shim.transformPoint(x, y, 0)
        handle.render2D(shim.encodeScalar(row * cols + col), tx, ty)
        pixels.push(shim.capturedPixel())
      }
    }

    paint(pixels, getBrightness(), dimmed)
    config.onFrame?.(scaledDelta, shim.builtins, clock.getTime())
  }

  function tick(realDelta: number): void {
    doTick(realDelta, isDimmed())
  }

  function reportError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    config.onError?.(error)
  }

  function loop(ts: number): void {
    const delta = lastTs === null ? 0 : ts - lastTs
    lastTs = ts
    try {
      tick(delta)
    } catch (err) {
      reportError(err)
      rafId = null
      return
    }
    // Windowed FPS: count the frames elapsed since the window opened and report
    // the average once it fills, smoothing per-frame jitter and capping updates
    // at ~2/sec. The opening frame marks t0 and isn't itself counted.
    if (fpsWindowStart === null) {
      fpsWindowStart = ts
    } else {
      fpsFrames++
      const windowMs = ts - fpsWindowStart
      if (windowMs >= FPS_WINDOW_MS) {
        config.onFps?.(Math.round((fpsFrames * 1000) / windowMs))
        fpsWindowStart = ts
        fpsFrames = 0
      }
    }
    rafId = requestAnimationFrame(loop)
  }

  return {
    start() {
      if (rafId !== null) return
      lastTs = null
      fpsWindowStart = null
      fpsFrames = 0
      rafId = requestAnimationFrame(loop)
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    },
    tick,
    renderPreviewFrame() {
      try {
        doTick(0, false)
      } catch (err) {
        reportError(err)
      }
    },
  }
}
