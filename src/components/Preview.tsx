import { useEffect, useRef, useState } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'
import { WatchPanel } from '@/components/WatchPanel'
import { ControlsPanel } from '@/components/ControlsPanel'
import { usePatternStore } from '@/store/patternStore'
import {
  useMapStore,
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_ID,
  DEFAULT_SHAPE_PIXEL_COUNT,
  DEFAULT_CUBE_SIDE,
  resolveMap,
} from '@/store/mapStore'
import { useCameraStore } from '@/store/cameraStore'
import { createShim, createFxShim, type ShimContext } from '@/engine/shim'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { bundle } from '@/engine/bundle'
import { createRenderer, BASE_DOT_FRACTION } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createVirtualClock } from '@/engine/virtualClock'
import { createPlaneMap, cubePixelCount } from '@/engine/maps'
import { clampPixelCount, advanceAutoOrbit } from '@/engine/camera'
import { layoutSource as buildLayoutSource } from '@/store/mapStore'
import { resolveLayoutSelection } from '@/engine/layout'
import { SHAPES, embedPositions, type ShapeId } from '@/engine/shapes'
import type { MapPoint } from '@/engine/maps'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'

// Square 3D viewport size (CSS px), capped so the orbiting cube fits comfortably.
function cube3DCanvasPx(containerWidth: number): number {
  return Math.max(200, Math.min(560, Math.floor(containerWidth)))
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const grid = usePreviewStore((s) => s.grid)
  const spacingScale = usePreviewStore((s) => s.spacingScale)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const previewSource = useEditorStore((s) => s.previewSource)
  const displayDim = useEditorStore((s) => s.displayDim)
  const controlValues = useControlStore((s) => s.controlValues)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const handleRef = useRef<ReturnType<typeof loadPattern> | null>(null)
  const shimRef = useRef<ShimContext | null>(null)
  const [canvasDims, setCanvasDims] = useState<{ spacing: number } | null>(null)
  // The square 3D viewport size (CSS px) when a 3D layout is active, else null.
  // Drives the diffusion blur in 3D, where there is no locked-2D `spacing`.
  const [canvas3DPx, setCanvas3DPx] = useState<number | null>(null)
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
      // Auto-fit to container, then apply the uniform spacing scale (§5) on top.
      const spacing = Math.max(1, (width / cols) * usePreviewStore.getState().spacingScale)
      setCanvasDims({ spacing })
      if (rendererRef.current) {
        rendererRef.current.updateGrid({ ...usePreviewStore.getState().grid, spacing })
        if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recompute spacing when cols or the spacing scale changes without a resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width } = el.getBoundingClientRect()
    setCanvasDims({ spacing: Math.max(1, (width / grid.cols) * spacingScale) })
  }, [grid.cols, spacingScale])

  // Rebuild the loop whenever source or spacing changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewSource || !canvasDims) return
    setRuntimeError(null)

    const gridWithDims = { ...usePreviewStore.getState().grid, ...canvasDims }

    // Bundle first so the pattern's native dimensionality (highest render fn) is
    // known before resolving its layout — the dropdown filters by it (ADR-0005).
    let bundled: ReturnType<typeof bundle>
    try {
      bundled = bundle(previewSource, LIBRARIES)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }
    const { code, fxCode, metadata } = bundled
    const nativeDim = nativeDimension(metadata.renderFns)
    useEditorStore.getState().setNativeDim(nativeDim)

    // Resolve the active layout (ADR-0005): a 1D pattern draws on a viewport
    // shape embedding (pos-only, empty `sample`); a 2D pattern on a map. The pure
    // helper corrects a stale persisted selection to the dimension's default, and
    // we reflect any correction back so the "Shape" dropdown stays in sync.
    const { userMaps } = useMapStore.getState()
    const selection = resolveLayoutSelection(
      { mapId: activeMapId, shapeId: activeShapeId },
      nativeDim,
      buildLayoutSource({ userMaps }),
    )
    if (selection.mapId && selection.mapId !== activeMapId) {
      useMapStore.getState().setActiveMap(selection.mapId)
    }
    if (selection.shapeId && selection.shapeId !== activeShapeId) {
      useMapStore.getState().setActiveShape(selection.shapeId as ShapeId)
    }

    // 1D shape: pos-only embedding over an empty sample (count from the persisted
    // value or a 1D default). 2D map: row-major plane reproducing the legacy grid
    // loop's coordinates exactly (no-regression), count = rows×cols. 3D map: a
    // cube lattice whose `pos` feeds the orbit renderer (#129), count = side³.
    let pixelCount: number
    let mapPoints: MapPoint[]
    let shapePositions: [number, number][] | null = null
    let positions3D: [number, number, number][] | null = null
    let displayDim: 1 | 2 | 3
    if (selection.shapeId) {
      const shape = SHAPES[selection.shapeId as ShapeId]
      pixelCount = clampPixelCount(activePixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
      shapePositions = embedPositions(shape, pixelCount)
      mapPoints = shapePositions.map((pos) => ({ sample: [], pos }))
      displayDim = shape.displayDim
    } else {
      const map = resolveMap(selection.mapId ?? DEFAULT_MAP_ID, userMaps)
      if (map.dim === 3) {
        // 3D cube lattice: side³ pixels, each carrying a [0,1]³ `pos` the orbit
        // camera projects. The render loop dispatches render3D on the 3-arity
        // sample; the renderer draws via the camera path.
        pixelCount = clampPixelCount(cubePixelCount(DEFAULT_CUBE_SIDE))
        mapPoints = map.resolve(pixelCount)
        positions3D = mapPoints.map((p) => p.pos as [number, number, number])
        displayDim = 3
      } else {
        // 1a stock plane: tracks the global grid seed (per-pattern map params land
        // in a later slice). Build it AT the grid dims so the sampled coordinates
        // line up with the renderer's locked-2D grid layout exactly — a fixed-size
        // stock plane would tile/overflow against a differently-sized grid. count
        // is therefore rows×cols, not the persisted pixelCount.
        pixelCount = gridWithDims.rows * gridWithDims.cols
        mapPoints = createPlaneMap({
          rows: gridWithDims.rows,
          cols: gridWithDims.cols,
        }).resolve(pixelCount)
        displayDim = 2
      }
    }
    useEditorStore.getState().setDisplayDim(displayDim)

    const clock = createVirtualClock()
    const shimConfig = {
      mapPoints,
      pixelCount,
      dimensions: nativeDim,
      getVirtualTime: () => clock.getTime(),
    }
    // The Precise renderer runs the 16.16 fixed-point emit + shim; the Fast
    // renderer runs the plain float64 emit + shim. The hardware `code` artifact
    // is unaffected.
    const shim = fidelity === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)
    shimRef.current = shim

    let handle: ReturnType<typeof loadPattern>
    try {
      handle = loadPattern(fidelity === 'fast' ? code : fxCode, metadata, shim.builtins)
      handleRef.current = handle
      useEditorStore.getState().setPatternVars(metadata.patternVars)
      useEditorStore.getState().setControls(metadata.controls)
      // Seed control UI from the pattern's own initialised vars so swatches and
      // sliders show the real starting values on mount. The vars already ran via
      // the pattern's own initialiser, so we read them rather than invoking the
      // callback (which would overwrite hand-picked defaults).
      //   sliders/toggles: convention `sliderFoo`/`toggleFoo` ↔ `foo` (lowercase
      //     first remaining char).
      //   pickers: metadata.pickerVars lists the vars backing each h/s/v or
      //     r/g/b arg (recovered from the picker function body by the bundler).
      const exports = handle.getExports()
      // Exports are raw int32 in fidelity mode; decode to the float UI domain.
      const decode = (raw: unknown): number | undefined =>
        typeof raw === 'number' ? shim.decodeScalar(raw) : undefined
      const defaults: Record<string, number | [number, number, number]> = {}
      for (const c of metadata.controls) {
        if (c.kind === 'slider' || c.kind === 'toggle') {
          const stem = c.exportName.slice(c.kind.length)
          const varName = stem.charAt(0).toLowerCase() + stem.slice(1)
          const v = decode(exports[varName])
          if (v === undefined) continue
          if (c.kind === 'slider') defaults[c.exportName] = Math.max(0, Math.min(1, v))
          else defaults[c.exportName] = v !== 0 ? 1 : 0
        } else if (c.kind === 'hsvPicker' || c.kind === 'rgbPicker') {
          const vars = c.pickerVars
          if (!vars || vars.length !== 3) continue
          const comps = vars.map((name) => decode(exports[name]))
          if (comps.some((v) => v === undefined)) continue
          defaults[c.exportName] = comps.map((v) => Math.max(0, Math.min(1, v as number))) as [
            number,
            number,
            number,
          ]
        }
      }
      useControlStore.getState().resetControls(defaults)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setRuntimeError(msg))
      return
    }

    const renderer = createRenderer(canvas, gridWithDims)
    rendererRef.current = renderer
    // Drive draw positions from the 1D shape embedding when one is active; null
    // leaves the locked-2D grid path untouched (the plane stays bit-for-bit).
    renderer.setShapePositions(positions3D ? null : shapePositions)
    // 3D layout: hand the orbit renderer the cube's [0,1]³ positions, a square
    // canvas, and a base dot size; seed the camera from the ephemeral store.
    if (positions3D) {
      const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 400
      const px = cube3DCanvasPx(containerWidth)
      renderer.set3DPositions(positions3D, { canvasPx: px })
      renderer.setCamera(useCameraStore.getState().camera)
      setCanvas3DPx(px)
    } else {
      renderer.set3DPositions(null)
      setCanvas3DPx(null)
    }

    // 3D paint wrapper: push the live camera angle before drawing. The angle is
    // advanced by an independent rAF (the auto-orbit effect below) so the viewport
    // spin is decoupled from the pattern's play/pause. Read via getState so it
    // never churns React.
    const paint = (pixels: [number, number, number][], brightness: number, dimmed: boolean) => {
      if (positions3D) renderer.setCamera(useCameraStore.getState().camera)
      renderer.paint(pixels, brightness, dimmed)
    }

    const loop = createRenderLoop({
      handle, shim, clock,
      mapPoints, pixelCount,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint,
      onError: (err) => setRuntimeError(err.message),
      onFps: (fps) => usePreviewStore.getState().setFps(fps),
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
  }, [previewSource, canvasDims, fidelity, activeMapId, activeShapeId, activePixelCount])

  // Hydrate the per-pattern layout on open (ADR-0004/0005): restore the record's
  // persisted mapId/shapeId/pixelCount, falling back to defaults when absent so a
  // freshly-opened pattern doesn't inherit the previous one's selection. The
  // build effect's resolveLayoutSelection then validates these against the
  // pattern's native dimensionality. Camera/spacing are global, not restored here.
  useEffect(() => {
    if (!activePatternId) return
    const rec = usePatternStore.getState().userPatterns.find((p) => p.id === activePatternId)
    const m = useMapStore.getState()
    m.setActiveMap(rec?.mapId ?? DEFAULT_MAP_ID)
    m.setActiveShape((rec?.shapeId as ShapeId) ?? DEFAULT_SHAPE_ID)
    m.setActivePixelCount(rec?.pixelCount ?? null)
  }, [activePatternId])

  // Persist the active layout back onto the PatternRecord whenever it changes, so
  // reopening restores the layout the pattern was authored against. Both knobs
  // and the count ride along; the pure resolver picks the right one per native
  // dimensionality on the next open. No-op without an active user pattern.
  useEffect(() => {
    if (!activePatternId) return
    usePatternStore.getState().updatePatternLayout(activePatternId, {
      mapId: activeMapId,
      shapeId: activeShapeId,
      pixelCount: activePixelCount ?? undefined,
      params: { rows: grid.rows, cols: grid.cols },
    })
  }, [activePatternId, activeMapId, activeShapeId, activePixelCount, grid.rows, grid.cols])

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
    else {
      loop.stop()
      usePreviewStore.getState().setFps(null)
    }
  }, [isRunning])

  // Repaint on camera change while paused (drag-to-orbit / reset / auto-orbit).
  // While the pattern runs the loop already repaints every frame, so only act
  // when stopped. Subscribing outside React keeps the 60fps camera churn off the
  // component tree.
  useEffect(() => {
    return useCameraStore.subscribe((state) => {
      const r = rendererRef.current
      if (!r) return
      r.setCamera(state.camera)
      if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
    })
  }, [])

  // Auto-orbit drive: an independent rAF that advances the turntable whenever a
  // 3D layout is active and auto-orbit is armed — decoupled from the pattern's
  // play/pause, so the viewport keeps spinning even while the pattern is paused.
  // It only advances the angle; the subscription above (paused) and the render
  // loop (running) handle the actual repaint.
  useEffect(() => {
    if (displayDim !== 3) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const { autoOrbit, camera, setCamera } = useCameraStore.getState()
      if (autoOrbit) setCamera(advanceAutoOrbit(camera, dt))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [displayDim])

  // Diffusion blur: scaled to the dot pitch so it reads the same at any size. In
  // 2D the pitch is the grid `spacing`; in 3D it's the camera's base dot diameter
  // (canvas edge × BASE_DOT_FRACTION), so the slider behaves the same in 3D.
  const diffusionPitch =
    displayDim === 3
      ? (canvas3DPx ?? 0) * BASE_DOT_FRACTION
      : canvasDims?.spacing ?? grid.spacing
  const diffusionFilter =
    grid.diffusion > 0 && diffusionPitch > 0
      ? { filter: `blur(${(grid.diffusion * diffusionPitch * 1.05).toFixed(1)}px)` }
      : undefined

  return (
    <div className="h-full bg-zinc-950 pt-3 pl-3 flex flex-col">
      <div ref={containerRef} className="relative w-full flex-1 min-h-0">
        <div className="flex flex-col">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              className="rounded-sm"
              style={diffusionFilter}
            />
            {/* Orbit viewport controls — gated on the active layout's display
                dimension (#129), so a 1D pattern on a 3D shape still gets them. */}
            {displayDim === 3 && <OrbitControls canvasRef={canvasRef} />}
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
