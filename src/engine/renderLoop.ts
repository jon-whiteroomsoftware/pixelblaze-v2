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
}

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

  function doTick(realDelta: number, dimmed: boolean): void {
    const scaledDelta = realDelta * getSpeed()
    clock.advance(scaledDelta)
    handle.beforeRender(scaledDelta)

    const { rows, cols } = grid
    const pixels: [number, number, number][] = []

    for (let row = 0; row < rows; row++) {
      const y = rows === 1 ? 0 : row / (rows - 1)
      for (let col = 0; col < cols; col++) {
        const x = cols === 1 ? 0 : col / (cols - 1)
        handle.render2D(row * cols + col, x, y)
        pixels.push(shim.capturedPixel())
      }
    }

    paint(pixels, getBrightness(), dimmed)
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
    rafId = requestAnimationFrame(loop)
  }

  return {
    start() {
      if (rafId !== null) return
      lastTs = null
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
