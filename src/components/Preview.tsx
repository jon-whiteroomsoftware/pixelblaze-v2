import { useEffect, useRef, useState } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const previewSource = useEditorStore((s) => s.previewSource)
  const [canvasDims, setCanvasDims] = useState<{ spacing: number } | null>(null)

  // Derive spacing from container width so cols always fill the available width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect
      const { cols } = usePreviewStore.getState().grid
      setCanvasDims({ spacing: Math.max(1, Math.floor(width / cols)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Rebuild the loop whenever source or spacing changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewSource || !canvasDims) return

    const grid = { ...usePreviewStore.getState().grid, ...canvasDims }

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

    // Preserve running state across pattern switches and resizes
    if (usePreviewStore.getState().isRunning) {
      loop.start()
    }

    return () => loop.stop()
  }, [previewSource, canvasDims])

  // Start / stop when isRunning changes
  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else loop.stop()
  }, [isRunning])

  return (
    <div className="h-full bg-zinc-950 pt-3 pl-3">
      <div ref={containerRef} className="w-full h-full">
        <canvas ref={canvasRef} className="rounded-sm" />
      </div>
    </div>
  )
}
