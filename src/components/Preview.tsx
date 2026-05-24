import { useEffect, useRef } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { createShim } from '@/engine/shim'
import { loadPattern } from '@/engine/loadPattern'
import { bundle } from '@/engine/bundle'
import { createRenderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createVirtualClock } from '@/engine/virtualClock'
import { LIBRARIES } from '@/pixelblaze/libs'

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const previewSource = useEditorStore((s) => s.previewSource)

  // Rebuild the loop whenever a new clean source is pushed (pattern switch or sync tick)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewSource) return

    const grid = usePreviewStore.getState().grid

    const clock = createVirtualClock()
    const shim = createShim({ grid, getVirtualTime: () => clock.getTime() })
    const { code, metadata } = bundle(previewSource, LIBRARIES)
    const handle = loadPattern(code, metadata, shim.builtins)
    const renderer = createRenderer(canvas, grid)

    const loop = createRenderLoop({
      handle,
      shim,
      clock,
      grid,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint: renderer.paint.bind(renderer),
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    // Preserve running state across pattern switches and sync-tick reloads
    if (usePreviewStore.getState().isRunning) {
      loop.start()
    }

    return () => loop.stop()
  }, [previewSource])

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
