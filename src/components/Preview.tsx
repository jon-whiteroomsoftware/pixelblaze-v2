import { useEffect, useRef } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { createShim } from '@/engine/shim'
import { loadPattern } from '@/engine/loadPattern'
import { createRenderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { SEED_PATTERN } from '@/pixelblaze/seedPattern'

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)

  // Build loop on mount; rebuild if source changes (sync tick will do this later)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const grid = usePreviewStore.getState().grid

    const shim = createShim({ grid, getVirtualTime: () => Date.now() })
    const handle = loadPattern(SEED_PATTERN, { exportedVars: [], controls: [] }, shim.builtins)
    const renderer = createRenderer(canvas, grid)

    const loop = createRenderLoop({
      handle,
      shim,
      grid,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint: renderer.paint.bind(renderer),
    })

    loopRef.current = loop
    loop.tick(0) // render one frozen frame immediately

    return () => loop.stop()
  }, [])

  // Start / stop when isRunning changes
  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else loop.stop()
  }, [isRunning])

  return (
    <div className="flex items-center justify-center h-full bg-zinc-950">
      <canvas ref={canvasRef} className="rounded-sm" />
    </div>
  )
}
