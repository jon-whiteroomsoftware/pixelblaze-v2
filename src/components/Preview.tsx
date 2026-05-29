import { useEffect, useRef, useState } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'
import { WatchPanel } from '@/components/WatchPanel'
import { ControlsPanel } from '@/components/ControlsPanel'
import { createShim, createFxShim, type ShimContext } from '@/engine/shim'
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
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const grid = usePreviewStore((s) => s.grid)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const previewSource = useEditorStore((s) => s.previewSource)
  const controlValues = useControlStore((s) => s.controlValues)
  const handleRef = useRef<ReturnType<typeof loadPattern> | null>(null)
  const shimRef = useRef<ShimContext | null>(null)
  const [canvasDims, setCanvasDims] = useState<{ spacing: number } | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  // Derive spacing from container width so cols always fill the available width.
  // Also directly updates the renderer on each observation to avoid waiting for
  // the React re-render cycle, which would lag the canvas behind the container
  // during splitter drags.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect
      const { cols } = usePreviewStore.getState().grid
      const spacing = Math.max(1, width / cols)
      setCanvasDims({ spacing })
      if (rendererRef.current) {
        rendererRef.current.updateGrid({ ...usePreviewStore.getState().grid, spacing })
        if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recompute spacing when cols changes without a container resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width } = el.getBoundingClientRect()
    setCanvasDims({ spacing: Math.max(1, width / grid.cols) })
  }, [grid.cols])

  // Rebuild the loop whenever source or spacing changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewSource || !canvasDims) return
    setRuntimeError(null)

    const gridWithDims = { ...usePreviewStore.getState().grid, ...canvasDims }

    const clock = createVirtualClock()
    const shimConfig = { grid: gridWithDims, getVirtualTime: () => clock.getTime() }
    // Fidelity mode runs the 16.16 fixed-point emit + shim; Fast preview runs
    // the plain float64 emit + shim. The hardware `code` artifact is unaffected.
    const shim = fidelity === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)
    shimRef.current = shim

    let handle: ReturnType<typeof loadPattern>
    try {
      const { code, fxCode, metadata } = bundle(previewSource, LIBRARIES)
      handle = loadPattern(fidelity === 'fast' ? code : fxCode, metadata, shim.builtins)
      handleRef.current = handle
      useEditorStore.getState().setPatternVars(metadata.patternVars)
      useEditorStore.getState().setControls(metadata.controls)
      // Seed slider/toggle UI from the pattern's own initialised vars.
      // Convention: `sliderFoo` ↔ `foo`, `toggleFoo` ↔ `foo` (lowercase first
      // remaining char). The exported var's value already ran via the pattern's
      // own initialiser, so we don't invoke the callback on mount — that would
      // overwrite hand-picked defaults. Pickers are intentionally not seeded
      // (no naming convention for triplets); their vars stand at init values
      // and the swatch shows white until the user touches it.
      const exports = handle.getExports()
      const defaults: Record<string, number | [number, number, number]> = {}
      for (const c of metadata.controls) {
        if (c.kind !== 'slider' && c.kind !== 'toggle') continue
        const stem = c.exportName.slice(c.kind.length)
        const varName = stem.charAt(0).toLowerCase() + stem.slice(1)
        const rawV = exports[varName]
        if (typeof rawV !== 'number') continue
        // Exports are raw int32 in fidelity mode; decode to the float UI domain.
        const v = shim.decodeScalar(rawV)
        if (c.kind === 'slider') defaults[c.exportName] = Math.max(0, Math.min(1, v))
        else defaults[c.exportName] = v !== 0 ? 1 : 0
      }
      useControlStore.getState().resetControls(defaults)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }

    const renderer = createRenderer(canvas, gridWithDims)
    rendererRef.current = renderer

    const paint = (pixels: [number, number, number][], brightness: number, dimmed: boolean) => {
      renderer.paint(pixels, brightness, dimmed)
    }

    const loop = createRenderLoop({
      handle, shim, clock,
      grid: gridWithDims,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint,
      onError: (err) => setRuntimeError(err.message),
      onFrame: (_delta, builtins, elapsedMs) => {
        const { watchedBuiltins, watchedPatternVars } = usePreviewStore.getState()
        if (watchedBuiltins.length === 0 && watchedPatternVars.length === 0) return
        // Watched values live in the pattern's numeric domain (raw int32 in
        // fidelity mode); decode scalars and array elements to the float UI
        // domain so the panel reads the same in fast and fidelity modes.
        // decodeScalar is identity in fast mode.
        const dec = shim.decodeScalar
        const decode = (v: unknown): unknown =>
          typeof v === 'number'
            ? dec(v)
            : Array.isArray(v)
              ? (v as unknown[]).map((n) => (typeof n === 'number' ? dec(n) : n))
              : v
        const values: Record<string, unknown> = {}
        if (watchedBuiltins.includes('elapsed')) {
          values['elapsed'] = `${(elapsedMs / 1000).toFixed(1)}s`
        }
        for (const name of watchedBuiltins) {
          if (name !== 'elapsed') values[name] = decode(builtins[name])
        }
        const exports = handle.getExports()
        for (const name of watchedPatternVars) {
          values[name] = decode(exports[name])
        }
        usePreviewStore.getState().setWatchValues(values)
      },
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    if (usePreviewStore.getState().isRunning) loop.start()

    return () => loop.stop()
  }, [previewSource, canvasDims, fidelity])

  // Forward control value changes to the live pattern handle
  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return
    // Control values arrive in the float UI domain; encode to the pattern's
    // numeric domain (raw int32 in fidelity mode) before invoking callbacks.
    const enc = shimRef.current?.encodeScalar ?? ((n: number) => n)
    for (const [name, value] of Object.entries(controlValues)) {
      if (Array.isArray(value)) handle.controls[name]?.(...(value as number[]).map(enc))
      else handle.controls[name]?.(enc(value))
    }
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
  }, [controlValues])

  // Push grid changes to the renderer without rebuilding the loop
  useEffect(() => {
    if (!canvasDims) return
    rendererRef.current?.updateGrid({ ...grid, ...canvasDims })
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
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
              style={grid.diffusion > 0 ? {
                filter: `blur(${(grid.diffusion * (canvasDims?.spacing ?? grid.spacing) * 0.7).toFixed(1)}px)`,
              } : undefined}
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
