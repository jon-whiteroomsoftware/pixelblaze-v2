import { useEffect, useRef, useState } from 'react'
import { usePreviewStore } from '@/store/previewStore'
import { useEditorStore } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'
import { PreviewDeck } from '@/components/PreviewDeck'
import { usePatternStore } from '@/store/patternStore'
import {
  useMapStore,
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_ID,
  DEFAULT_SURFACE_ID,
  DEFAULT_SOLIDITY,
  DEFAULT_NORMALIZE_MODE,
  DEFAULT_SHAPE_PIXEL_COUNT,
  defaultPixelCountForDim,
  resolveMap,
} from '@/store/mapStore'
import { useCameraStore } from '@/store/cameraStore'
import { createShim, createFxShim, type ShimContext } from '@/engine/shim'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { bundle } from '@/engine/bundle'
import { createRenderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createVirtualClock } from '@/engine/virtualClock'
import { clampPixelCount, advanceAutoOrbit } from '@/engine/camera'
import { layoutSource as buildLayoutSource } from '@/store/mapStore'
import { resolveLayout, resolveSolidity } from '@/engine/layout'
import { polePositions, poleNormals, defaultPoleCols, type ShapeId } from '@/engine/shapes'
import { type SurfaceId } from '@/engine/surfaces'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'
import {
  recommendedMapFor,
  recommendedPixelCountFor,
  recommendedSolidityFor,
} from '@/pixelblaze/demos'

// Square 3D viewport size (CSS px): fill the available pane edge-to-edge (the
// smaller of its two sides), so the 3D canvas is exactly as tall as a square 2D
// canvas — no margin, which previously made 3D layouts ~40px shorter than 2D. The
// orbiting model is as large as possible (fidelity over breathing room, #146), and
// the bounding-sphere fit (engine) guarantees it never clips at any angle.
function cube3DCanvasPx(containerWidth: number, containerHeight: number): number {
  return Math.max(200, Math.floor(Math.min(containerWidth, containerHeight)))
}

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const isRunning = usePreviewStore((s) => s.isRunning)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const fidelity = usePreviewStore((s) => s.fidelity)
  const previewSource = useEditorStore((s) => s.previewSource)
  const displayDim = useEditorStore((s) => s.displayDim)
  const controlValues = useControlStore((s) => s.controlValues)
  const activePatternId = usePatternStore((s) => s.activePatternId)
  const activeDemoName = usePatternStore((s) => s.activeDemoName)
  const activeMapId = useMapStore((s) => s.activeMapId)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activeSurfaceId = useMapStore((s) => s.activeSurfaceId)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const activeSolidity = useMapStore((s) => s.activeSolidity)
  const activeNormalizeMode = useMapStore((s) => s.activeNormalizeMode)
  const handleRef = useRef<ReturnType<typeof loadPattern> | null>(null)
  const shimRef = useRef<ShimContext | null>(null)
  // The 2D viewport the renderer fits to: the container width + the live light
  // size. The layout's extent/aspect come from the active map's `pos` (ADR-0009),
  // measured inside the renderer — not from any stored grid.
  const [viewport, setViewport] = useState<{ containerWidth: number; lightSize: number } | null>(null)
  // The square 3D viewport size (CSS px) when a 3D layout is active, else null.
  // Sizes the square 3D canvas; the renderer owns the diffusion glow internally
  // (it measures the projected neighbour pitch from the layout it was handed).
  const [canvas3DPx, setCanvas3DPx] = useState<number | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  // Track the container width so the renderer fits the canvas to the pane. Also
  // directly re-fits the renderer on each observation to avoid waiting for the
  // React re-render cycle, which would lag the canvas behind the container during
  // splitter drags. The canvas aspect comes from the active map's `pos` (ADR-0009),
  // resolved inside the renderer; light size scales the drawn sources only.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect
      const containerWidth = Math.max(1, width)
      const lightSize = usePreviewStore.getState().lightSize
      setViewport({ containerWidth, lightSize })
      if (rendererRef.current) {
        rendererRef.current.resize2D({ containerWidth, lightSize })
        if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Re-fit when the light size changes without a resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width } = el.getBoundingClientRect()
    setViewport({ containerWidth: Math.max(1, width), lightSize })
  }, [lightSize])

  // Rebuild the loop whenever source or the viewport changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewport) return
    setRuntimeError(null)

    // Opening a map (editor map mode) must NOT touch the preview — it changes the
    // editor surface only, leaving the running pattern rendering untouched. Map
    // preview is deferred (#153, blocked on #143 eval/bake). Entering map mode
    // changes no preview input (previewSource/activeMapId/…), so this loop isn't
    // even rebuilt; nothing here special-cases map mode.
    if (!previewSource) return

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
    // A read-only demo has no PatternRecord, so it persists no map; honour its
    // recommended map (if any) as the on-open default instead of the bare
    // first-match. Preview-only — never reaches pattern source or hardware.
    const activeDemoName = usePatternStore.getState().activeDemoName
    const recommendedMapId = recommendedMapFor(activeDemoName)
    // A demo persists no count either; honour its recommended pixel count (if any)
    // as the on-open default, ahead of the per-dimension default. Preview-only and
    // freely overridable from the count box.
    const recommendedPixelCount = recommendedPixelCountFor(activeDemoName)
    // Resolve the full layout in one engine query (src/engine/layout.ts):
    // selection-correction + map/shape/surface resolution + normalization +
    // positions + solid-eligible normals + the grid readout. Store-coupled
    // lookups are injected so the resolver stays engine-pure and table-tested.
    const layout = resolveLayout(
      {
        selection: { mapId: activeMapId, shapeId: activeShapeId, surfaceId: activeSurfaceId },
        nativeDim,
        source: buildLayoutSource({ userMaps }),
        persistedCount: activePixelCount,
        normalizeMode: activeNormalizeMode,
        recommendedMapId,
        recommendedCount: recommendedPixelCount,
        poleCols: useCameraStore.getState().poleCols,
        shapeDefaultCount: DEFAULT_SHAPE_PIXEL_COUNT,
      },
      {
        resolveMap: (mapId) => resolveMap(mapId ?? DEFAULT_MAP_ID, userMaps),
        defaultCountForDim: defaultPixelCountForDim,
      },
    )

    // Reflect any dimension-correction back onto the store so the dropdowns stay
    // in sync with what was actually drawn.
    const { correctedSelection } = layout
    if (correctedSelection.mapId && correctedSelection.mapId !== activeMapId) {
      useMapStore.getState().setActiveMap(correctedSelection.mapId)
    }
    if (correctedSelection.shapeId && correctedSelection.shapeId !== activeShapeId) {
      useMapStore.getState().setActiveShape(correctedSelection.shapeId as ShapeId)
    }
    if (correctedSelection.surfaceId && correctedSelection.surfaceId !== activeSurfaceId) {
      useMapStore.getState().setActiveSurface(correctedSelection.surfaceId)
    }

    const { mapPoints, pixelCount, draw } = layout
    // Split the draw channel back into the prior locals so the renderer wiring
    // below is unchanged: the 3D channel carries positions + (solid-eligible)
    // normals; the 2D channel a single pos list.
    const positions3D = draw.kind === '3d' ? draw.positions : null
    const normals3D = draw.kind === '3d' ? draw.normals : null
    const shapePositions = draw.kind === '2d' ? draw.positions : null

    useEditorStore.getState().setDisplayDim(layout.displayDim)
    useEditorStore.getState().setLayoutLabel(layout.layoutLabel)
    // A normal array is fed exactly for a solid-eligible embedding (Pole, Cylinder,
    // Sphere shell, Cube shell), so its presence IS the eligibility the deck's
    // solidity slider keys on (ADR-0011).
    useEditorStore.getState().setSolidEligible(normals3D !== null)

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

    const renderer = createRenderer(canvas, viewport)
    rendererRef.current = renderer
    // 3D layout: hand the orbit renderer the cube's [0,1]³ positions, a square
    // canvas, and a base dot size; seed the camera from the ephemeral store.
    if (positions3D) {
      // The canvas container now wraps only the canvas (deck sits below), so its
      // height is circular with the canvas size. Size the square 3D viewport off
      // the pane width alone — the dominant constraint for the narrow preview pane.
      const rect = containerRef.current?.getBoundingClientRect()
      const width = rect?.width ?? 400
      const px = cube3DCanvasPx(width, width)
      renderer.set3DPositions(positions3D, { canvasPx: px, normals: normals3D })
      renderer.setCamera(useCameraStore.getState().camera)
      renderer.setSolidity(useMapStore.getState().activeSolidity)
      setCanvas3DPx(px)
    } else {
      // Every 2D layout — stock plane, ring/cloud, or a 1D shape embedding — draws
      // through the single pos channel; the renderer measures extent + neighbour
      // pitch from these points (ADR-0009). An empty array is a valid no-op layout.
      renderer.set2DPositions(shapePositions ?? [], viewport)
      setCanvas3DPx(null)
    }
    renderer.setDiffusion(usePreviewStore.getState().diffusion)

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
      onFrame: (_delta, _builtins, elapsedMs) => {
        // Telemetry is unconditional (#150): publish elapsed every frame so the
        // readout's elapsed cell always tracks, independent of variable watching.
        usePreviewStore.getState().setElapsed(elapsedMs)
        if (!usePreviewStore.getState().watchPatternVars) return
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
        const exports = handle.getExports()
        for (const name of useEditorStore.getState().patternVars) {
          values[name] = decode(exports[name])
        }
        usePreviewStore.getState().setWatchValues(values)
      },
    })

    loopRef.current = loop
    loop.renderPreviewFrame()

    if (usePreviewStore.getState().isRunning) loop.start()

    return () => loop.stop()
  }, [previewSource, viewport, fidelity, activeMapId, activeShapeId, activeSurfaceId, activePixelCount, activeNormalizeMode])

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
    m.setActiveSurface((rec?.surfaceId as SurfaceId) ?? DEFAULT_SURFACE_ID)
    m.setActivePixelCount(rec?.pixelCount ?? null)
    m.setActiveNormalizeMode(rec?.normalize ?? DEFAULT_NORMALIZE_MODE)
  }, [activePatternId])

  // Resolve the on-open solidity (ADR-0011) for a pattern OR a demo: a user
  // pattern restores its persisted solidity; a demo (no PatternRecord) opens at
  // its recommended-solidity ahead of the global 1.0 default, then persists
  // nothing so the slider stays freely editable. Kept separate from the layout
  // hydrate above so it also fires when switching to a read-only demo.
  useEffect(() => {
    const rec = activePatternId
      ? usePatternStore.getState().userPatterns.find((p) => p.id === activePatternId)
      : undefined
    useMapStore
      .getState()
      .setActiveSolidity(
        resolveSolidity(rec?.solidity, recommendedSolidityFor(activeDemoName), DEFAULT_SOLIDITY),
      )
  }, [activePatternId, activeDemoName])

  // Persist the active layout back onto the PatternRecord whenever it changes, so
  // reopening restores the layout the pattern was authored against. The knobs and
  // the count ride along; the pure resolver picks the right one per native
  // dimensionality on the next open. The square-plane dims are derived from the
  // count (ADR-0009), not stored. No-op without an active user pattern.
  useEffect(() => {
    if (!activePatternId) return
    usePatternStore.getState().updatePatternLayout(activePatternId, {
      mapId: activeMapId,
      shapeId: activeShapeId,
      surfaceId: activeSurfaceId,
      pixelCount: activePixelCount ?? undefined,
      solidity: activeSolidity,
      normalize: activeNormalizeMode,
    })
  }, [activePatternId, activeMapId, activeShapeId, activeSurfaceId, activePixelCount, activeSolidity, activeNormalizeMode])

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

  // Re-fit the 2D canvas to the viewport without rebuilding the loop (e.g. a light-
  // size change). The layout's pos is unchanged, so this only re-fits the canvas.
  useEffect(() => {
    if (!viewport) return
    rendererRef.current?.resize2D(viewport)
    if (!usePreviewStore.getState().isRunning) {
      loopRef.current?.renderPreviewFrame()
    }
  }, [viewport])

  // Start / stop when isRunning changes
  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else {
      loop.stop()
      usePreviewStore.getState().setFps(null)
      usePreviewStore.getState().setElapsed(null)
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

  // Pole wrap density (#146): re-derive the 3D draw positions when the slider
  // moves, WITHOUT rebuilding the loop or reloading the pattern. The pole's
  // `sample` is empty (1D dispatch), so wrap density only changes where dots are
  // drawn — a cheap `set3DPositions` + repaint, not a full effect re-run. Gated
  // on the pole being the live layout (a 3D shape over the square 3D viewport).
  const poleCols = useCameraStore((s) => s.poleCols)
  useEffect(() => {
    if (activeShapeId !== 'pole' || displayDim !== 3 || canvas3DPx == null) return
    const renderer = rendererRef.current
    if (!renderer) return
    const count = clampPixelCount(activePixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
    const cols = poleCols ?? defaultPoleCols(count)
    const positions = polePositions(count, cols)
    renderer.set3DPositions(positions, { canvasPx: canvas3DPx, normals: poleNormals(count, cols) })
    // set3DPositions re-measures the layout's neighbour pitch + extent, so the orb
    // sizing and diffusion glow track the new geometry; reassert diffusion + solidity.
    renderer.setDiffusion(usePreviewStore.getState().diffusion)
    renderer.setSolidity(useMapStore.getState().activeSolidity)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [poleCols, activeShapeId, displayDim, canvas3DPx, activePixelCount])

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

  // Diffusion (ADR-0006, per-source glow): pushed into the WebGL renderer, which
  // grows a soft glow tail around each source's solid core to merge neighbours
  // like a physical diffuser — no whole-frame blur, so cores stay crisp, the array
  // edge never goes furry, and the 3D silhouette never smears. Repaint while paused
  // so the change shows immediately.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setDiffusion(diffusion)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [diffusion])

  // Solidity (ADR-0011, back-face terminator fade): pushed into the renderer,
  // which folds a normal·viewDir multiplier into the 3D per-vertex brightness when
  // the layout supplies normals. A no-op in 2D / for ineligible embeddings (no
  // normals fed). Repaint while paused so the change shows immediately.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setSolidity(activeSolidity)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [activeSolidity])

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      {/* Canvas flush at the top of the pane (#150): no header strip above it. The
          container drives the ResizeObserver fit; the deck stacks below. */}
      <div ref={containerRef} className="relative w-full shrink-0">
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="rounded-sm" />
          {/* Orbit viewport controls — gated on the active layout's display
              dimension (#129), so a 1D pattern on a 3D shape still gets them. Now
              at the top-right, clear of the navigation deck below the canvas. */}
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
      </div>
      <PreviewDeck />
    </div>
  )
}
