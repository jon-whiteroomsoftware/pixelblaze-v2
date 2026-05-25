import { useEffect, useRef, useState } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'
import { WatchPanel } from '@/components/WatchPanel'
import { ControlsPanel } from '@/components/ControlsPanel'
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
  const controlValues = useControlStore((s) => s.controlValues)
  const handleRef = useRef<ReturnType<typeof loadPattern> | null>(null)
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

  // Recompute spacing when cols changes without a container resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width } = el.getBoundingClientRect()
    setCanvasDims({ spacing: Math.max(1, Math.floor(width / grid.cols)) })
  }, [grid.cols])

  // Rebuild the loop whenever source or spacing changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewSource || !canvasDims) return
    setRuntimeError(null)

    const gridWithDims = { ...usePreviewStore.getState().grid, ...canvasDims }

    const clock = createVirtualClock()
    const shim = createShim({ grid: gridWithDims, getVirtualTime: () => clock.getTime() })

    let handle: ReturnType<typeof loadPattern>
    try {
      const { code, metadata } = bundle(previewSource, LIBRARIES)
      handle = loadPattern(code, metadata, shim.builtins)
      handleRef.current = handle
      useEditorStore.getState().setPatternVars(metadata.patternVars)
      useEditorStore.getState().setControls(metadata.controls)
      // Seed controlStore with defaults and invoke each control callback once
      const defaults: Record<string, number | [number, number, number]> = {}
      for (const c of metadata.controls) {
        if (c.kind === 'slider') defaults[c.exportName] = 0.5
        else if (c.kind === 'toggle') defaults[c.exportName] = 0
        else if (c.kind === 'hsvPicker') defaults[c.exportName] = [0, 1, 1]
        else if (c.kind === 'rgbPicker') defaults[c.exportName] = [1, 1, 1]
      }
      useControlStore.getState().resetControls(defaults)
      for (const [name, value] of Object.entries(defaults)) {
        if (Array.isArray(value)) handle.controls[name]?.(...(value as number[]))
        else handle.controls[name]?.(value)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }

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
      onFrame: (delta, builtins) => {
        const { watchedBuiltins, watchedPatternVars } = usePreviewStore.getState()
        if (watchedBuiltins.length === 0 && watchedPatternVars.length === 0) return
        const values: Record<string, unknown> = {}
        if (watchedBuiltins.includes('delta')) values['delta'] = delta
        for (const name of watchedBuiltins) {
          if (name !== 'delta') values[name] = builtins[name]
        }
        const exports = handle.getExports()
        for (const name of watchedPatternVars) {
          values[name] = exports[name]
        }
        usePreviewStore.getState().setWatchValues(values)
      },
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    if (usePreviewStore.getState().isRunning) loop.start()

    return () => loop.stop()
  }, [previewSource, canvasDims])

  // Forward control value changes to the live pattern handle
  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    for (const [name, value] of Object.entries(controlValues)) {
      if (Array.isArray(value)) handle.controls[name]?.(...(value as number[]))
      else handle.controls[name]?.(value)
    }
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
  }, [controlValues])

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
    <div className="h-full bg-zinc-950 pt-3 pl-3 flex flex-col">
      <div ref={containerRef} className="relative w-full flex-1 min-h-0">
        <div className="flex flex-col">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              className="rounded-sm"
              style={{ opacity: (1 - Math.pow(grid.glowAmount / 30, 2) * 0.65).toFixed(2) }}
            />
            {runtimeError && (
              <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                <div className="bg-zinc-900/80 rounded-lg px-4 py-3 max-w-[90%]">
                  <span className="text-red-400 text-sm font-mono break-words">
                    {runtimeError}
                  </span>
                </div>
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
                  filter: `blur(${Math.min(grid.glowAmount, 25)}px) brightness(${(1 + Math.pow(grid.glowAmount / 30, 2) * 5).toFixed(2)})`,
                  mixBlendMode: 'screen',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          <div className="mt-2">
            <WatchPanel />
            <ControlsPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
