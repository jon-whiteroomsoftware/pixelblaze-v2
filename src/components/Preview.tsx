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
  const glowCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const grid = usePreviewStore((s) => s.grid)
  const previewSource = useEditorStore((s) => s.previewSource)
  const [canvasDims, setCanvasDims] = useState<{ spacing: number } | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

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
    setRuntimeError(null)

    const gridWithDims = { ...usePreviewStore.getState().grid, ...canvasDims }

    const clock = createVirtualClock()
    const shim = createShim({ grid: gridWithDims, getVirtualTime: () => clock.getTime() })
    const { code, metadata } = bundle(previewSource, LIBRARIES)
    const handle = loadPattern(code, metadata, shim.builtins)
    const renderer = createRenderer(canvas, gridWithDims)
    rendererRef.current = renderer

    // After each paint, copy the sharp frame to the glow canvas so the
    // screen-blend overlay stays in sync without rebuilding the loop
    const paint = (pixels: [number, number, number][], brightness: number, dimmed: boolean) => {
      renderer.paint(pixels, brightness, dimmed)
      const gc = glowCanvasRef.current
      if (gc) {
        if (gc.width !== canvas.width) gc.width = canvas.width
        if (gc.height !== canvas.height) gc.height = canvas.height
        gc.getContext('2d')?.drawImage(canvas, 0, 0)
      }
    }

    const loop = createRenderLoop({
      handle, shim, clock,
      grid: gridWithDims,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint,
      onError: (err) => setRuntimeError(err.message),
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    if (usePreviewStore.getState().isRunning) loop.start()

    return () => loop.stop()
  }, [previewSource, canvasDims])

  // Push grid changes to the renderer without rebuilding the loop
  useEffect(() => {
    if (!canvasDims) return
    rendererRef.current?.updateGrid({ ...grid, ...canvasDims })
  }, [grid, canvasDims])

  // Start / stop when isRunning changes
  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else loop.stop()
  }, [isRunning])

  return (
    <div className="h-full bg-zinc-950 pt-3 pl-3">
      <div ref={containerRef} className="relative w-full h-full">
        <canvas ref={canvasRef} className="rounded-sm" />
        {runtimeError && (
          <div className="absolute inset-0 flex items-end justify-start p-2 pointer-events-none">
            <span className="text-red-400 text-xs bg-zinc-900/80 px-2 py-1 rounded max-w-full truncate">
              {runtimeError}
            </span>
          </div>
        )}
        {grid.glowAmount > 0 && (
          <canvas
            ref={glowCanvasRef}
            className="rounded-sm"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              filter: `blur(${grid.glowAmount}px) brightness(1.5)`,
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}
