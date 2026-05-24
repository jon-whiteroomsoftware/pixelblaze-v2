import type { PatternHandle } from './loadPattern'
import type { ShimContext } from './shim'

export interface RenderLoopConfig {
  handle: PatternHandle
  shim: ShimContext
  grid: { rows: number; cols: number }
  getSpeed: () => number
  getBrightness: () => number
  isDimmed: () => boolean
  paint: (pixels: [number, number, number][], brightness: number, dimmed: boolean) => void
}

export interface RenderLoop {
  start(): void
  stop(): void
  tick(realDelta: number): void
}

export function createRenderLoop(config: RenderLoopConfig): RenderLoop {
  const { handle, shim, grid, getSpeed, getBrightness, isDimmed, paint } = config
  let rafId: number | null = null
  let lastTs: number | null = null

  function tick(realDelta: number): void {
    const scaledDelta = realDelta * getSpeed()
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

    paint(pixels, getBrightness(), isDimmed())
  }

  function loop(ts: number): void {
    const delta = lastTs === null ? 0 : ts - lastTs
    lastTs = ts
    tick(delta)
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
  }
}
