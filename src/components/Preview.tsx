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
  DEFAULT_SHAPE_PIXEL_COUNT,
  DEFAULT_CUBE_SIDE,
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
import { createCylinderMap, cylinderDims, cubePixelCount, squarePlaneDims } from '@/engine/maps'
import {
  clampPixelCount,
  cubeSideForCount,
  advanceAutoOrbit,
  lattice3DPitchPx,
  fit3DScale,
  modelHalfExtent,
  FIT_3D_MARGIN,
  diffusionBlurStdDev,
  DIFFUSION_BLUR_PITCH_FACTOR_2D,
  DIFFUSION_BLUR_PITCH_FACTOR_3D,
} from '@/engine/camera'
import { layoutSource as buildLayoutSource } from '@/store/mapStore'
import { resolveLayoutSelection } from '@/engine/layout'
import {
  SHAPES,
  embedPositions,
  polePositions,
  defaultPoleCols,
  type ShapeId,
} from '@/engine/shapes'
import type { MapPoint } from '@/engine/maps'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'

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
  const grid = usePreviewStore((s) => s.grid)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
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
  const [canvasDims, setCanvasDims] = useState<{ spacing: number; lightSize: number } | null>(null)
  // The square 3D viewport size (CSS px) when a 3D layout is active, else null.
  // Drives the diffusion blur in 3D, where there is no locked-2D `spacing`.
  const [canvas3DPx, setCanvas3DPx] = useState<number | null>(null)
  // The active cube lattice side when a 3D layout is live; drives the diffusion
  // blur's projected-pitch calc, which must match the count-derived lattice.
  const [cube3DSide, setCube3DSide] = useState<number>(DEFAULT_CUBE_SIDE)
  // The active 3D model's bounding-sphere radius about the rotation centre, so the
  // diffusion blur's projected pitch tracks the same zoom the renderer fits to.
  const [model3DHalfExtent, setModel3DHalfExtent] = useState<number | null>(null)
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
      // Auto-fit the pitch to the container so the grid always fills the pane.
      // Light size scales the drawn sources only, not the canvas size.
      const spacing = Math.max(1, width / cols)
      const lightSize = usePreviewStore.getState().lightSize
      setCanvasDims({ spacing, lightSize })
      if (rendererRef.current) {
        rendererRef.current.updateGrid({ ...usePreviewStore.getState().grid, spacing, lightSize })
        if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recompute spacing when cols or the light size changes without a resize
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const { width } = el.getBoundingClientRect()
    setCanvasDims({ spacing: Math.max(1, width / grid.cols), lightSize })
  }, [grid.cols, lightSize])

  // Rebuild the loop whenever source or spacing changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvasDims) return
    setRuntimeError(null)

    // Opening a map (editor map mode) must NOT touch the preview — it changes the
    // editor surface only, leaving the running pattern rendering untouched. Map
    // preview is deferred (#153, blocked on #143 eval/bake). Entering map mode
    // changes no preview input (previewSource/activeMapId/…), so this loop isn't
    // even rebuilt; nothing here special-cases map mode.
    if (!previewSource) return

    const gridWithDims = { ...usePreviewStore.getState().grid, ...canvasDims }
    // The derived cube side for a 3D layout (set in the 3D branch), so the
    // diffusion blur and renderer use the count-derived lattice, not a fixed one.
    let cubeSide = DEFAULT_CUBE_SIDE

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
    // The realized grid readout, or null when there's no regular grid (a 1D strip
    // or an irregular custom point cloud). Reflects the actual arrangement, NOT
    // the viewport dimension — a 2D cylinder stays a 2D layout readout.
    let layoutLabel: string | null = null
    if (selection.shapeId) {
      const shape = SHAPES[selection.shapeId as ShapeId]
      pixelCount = clampPixelCount(activePixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
      if (shape.displayDim === 3) {
        // Pole: a 1D strip wrapped onto a cylinder, drawn in 3D (orbit camera).
        // `sample` stays empty (1D dispatch); only `pos` differs from line/ring.
        // Wrap density comes from the ephemeral camera store, clamped to the
        // taller-than-wide range for the current count; null → the shape default.
        const cols = useCameraStore.getState().poleCols ?? defaultPoleCols(pixelCount)
        positions3D = polePositions(pixelCount, cols)
        mapPoints = positions3D.map((pos) => ({ sample: [], pos }))
        cubeSide = cubeSideForCount(pixelCount) // dot-size reference only
        displayDim = 3
      } else {
        shapePositions = embedPositions(shape, pixelCount)
        mapPoints = shapePositions.map((pos) => ({ sample: [], pos }))
        displayDim = shape.displayDim
      }
    } else {
      const map = resolveMap(selection.mapId ?? DEFAULT_MAP_ID, userMaps)
      if (map.id === 'cylinder') {
        // Cylinder: a 2D grid wrapped onto a 3D surface. The pattern samples flat
        // [u,v] grid coords (render2D runs unchanged), but each pixel is drawn in
        // 3D on the cylinder wall, so it gets the orbit camera like the cube. The
        // count is the knob (ADR-0004): squared up to a grid, then wrapped.
        pixelCount = clampPixelCount(activePixelCount ?? defaultPixelCountForDim(2))
        // Non-square grid (cols ≈ π·rows) so the wrapped dots stay square on the
        // visible surface instead of bunching vertically.
        const dims = cylinderDims(pixelCount)
        mapPoints = createCylinderMap(dims).resolve(pixelCount)
        positions3D = mapPoints.map((p) => p.pos as [number, number, number])
        cubeSide = cubeSideForCount(pixelCount) // dot-size reference only
        // A 2D layout (wrapped), even though it's drawn in the 3D viewport.
        layoutLabel = `${dims.cols}×${dims.rows}`
        displayDim = 3
      } else if (map.dim === 3) {
        if (map.id === 'cube') {
          // 3D cube lattice: the pixel count is the knob (ADR-0004), so the stock
          // cube cubes the count up to a side³ lattice (count → nearest cube). The
          // source-backed map (ADR-0008) regenerates the lattice live for the
          // squared-up count; each point carries a [0,1]³ `pos` the orbit camera
          // projects and the render loop dispatches render3D on the 3-arity sample.
          const count = activePixelCount ?? defaultPixelCountForDim(3)
          cubeSide = cubeSideForCount(count)
          pixelCount = clampPixelCount(cubePixelCount(cubeSide))
          mapPoints = map.resolve(pixelCount)
          layoutLabel = `${cubeSide}×${cubeSide}×${cubeSide}`
        } else {
          // 3D point cloud: stock sphere/helix regenerate live for any count
          // (ADR-0008); a custom cloud replays its baked array index-aligned to the
          // count (ADR-0007). The count is a free knob (defaulting to a custom
          // map's baked length); over-count pixels fall to the origin, surplus
          // points go unvisited. `cubeSide` is only a dot-size reference here.
          pixelCount = clampPixelCount(activePixelCount ?? map.bakedCount ?? defaultPixelCountForDim(3))
          cubeSide = cubeSideForCount(pixelCount)
          mapPoints = map.resolve(pixelCount)
        }
        positions3D = mapPoints.map((p) => p.pos as [number, number, number])
        displayDim = 3
      } else if (map.id !== 'plane') {
        // 2D point cloud: the stock ring regenerates live (ADR-0008); a custom 2D
        // map replays its baked array. Irregular, non-grid positions — the 2D
        // consume path draws each point's [0,1]² `pos` through the shape-position
        // channel (the same seam 1D ring/helix embeddings use) rather than the
        // locked plane. A custom replay is index-aligned to the count (ADR-0007
        // drift), defaulting to the baked length.
        pixelCount = clampPixelCount(activePixelCount ?? map.bakedCount ?? defaultPixelCountForDim(2))
        mapPoints = map.resolve(pixelCount)
        shapePositions = mapPoints.map((p) => p.pos as [number, number])
        displayDim = 2
      } else {
        // 2D stock plane: the pixel count is the knob (ADR-0004); with no aspect
        // to honour the plane squares the count up to the most-square grid that
        // holds it. The renderer's locked-2D layout is driven by these derived
        // dims (synced to the store below) so sampled coords and drawn dots line
        // up exactly. count is the user's count, not rows×cols (the last grid row
        // may be partial).
        pixelCount = clampPixelCount(activePixelCount ?? defaultPixelCountForDim(2))
        const planeDims = squarePlaneDims(pixelCount)
        // Sync the renderer's locked-2D grid to the derived dims so the spacing
        // (fit-to-container) and projection machinery downstream uses them. Guard
        // on a change so re-running this effect doesn't churn the store needlessly.
        const cur = usePreviewStore.getState().grid
        if (cur.rows !== planeDims.rows || cur.cols !== planeDims.cols) {
          usePreviewStore.getState().setGrid(planeDims)
        }
        gridWithDims.rows = planeDims.rows
        gridWithDims.cols = planeDims.cols
        // Keep spacing fit to the container for the (possibly new) column count.
        gridWithDims.spacing = Math.max(1, canvasDims.spacing * cur.cols / planeDims.cols)
        mapPoints = map.resolve(pixelCount)
        layoutLabel = `${planeDims.cols}×${planeDims.rows}`
        displayDim = 2
      }
    }
    useEditorStore.getState().setDisplayDim(displayDim)
    useEditorStore.getState().setLayoutLabel(layoutLabel)

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
      // The canvas container now wraps only the canvas (deck sits below), so its
      // height is circular with the canvas size. Size the square 3D viewport off
      // the pane width alone — the dominant constraint for the narrow preview pane.
      const rect = containerRef.current?.getBoundingClientRect()
      const width = rect?.width ?? 400
      const px = cube3DCanvasPx(width, width)
      renderer.set3DPositions(positions3D, { canvasPx: px, side: cubeSide })
      renderer.setCamera(useCameraStore.getState().camera)
      setCanvas3DPx(px)
      setCube3DSide(cubeSide)
      setModel3DHalfExtent(modelHalfExtent(positions3D))
    } else {
      renderer.set3DPositions(null)
      setCanvas3DPx(null)
      setModel3DHalfExtent(null)
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
    renderer.set3DPositions(positions, {
      canvasPx: canvas3DPx,
      side: cubeSideForCount(count),
    })
    // A shorter pole has a smaller extent → the renderer zooms in further; keep
    // the diffusion pitch in step with that zoom.
    setModel3DHalfExtent(modelHalfExtent(positions))
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

  // Diffusion blur (ADR-0006): a Gaussian blur that merges the sources, applied
  // via an SVG feGaussianBlur (below) which runs in LINEAR light. CSS `blur()`
  // runs in gamma-encoded sRGB, where averaging a bright pixel with black lands
  // below the true midpoint — so it systematically dims (the #75 regression).
  // Linear-light blur conserves energy: peaks soften and gaps fill, but the
  // overall level holds, and it never resizes the sources. Scaled to the inter-
  // dot pitch so it reads the same at any size: in 2D the pitch is the grid
  // `spacing`; in 3D it's the projected lattice pitch — uniform across dimensions.
  const diffusionPitch =
    displayDim === 3
      ? lattice3DPitchPx(
          canvas3DPx ?? 0,
          cube3DSide,
          fit3DScale(FIT_3D_MARGIN, model3DHalfExtent ?? undefined),
        )
      : canvasDims?.spacing ?? grid.spacing
  const diffusionFactor =
    displayDim === 3 ? DIFFUSION_BLUR_PITCH_FACTOR_3D : DIFFUSION_BLUR_PITCH_FACTOR_2D
  const diffusionStdDev = diffusionBlurStdDev(diffusion, diffusionPitch, diffusionFactor)
  const diffusionFilter =
    diffusionStdDev > 0 ? { filter: 'url(#preview-diffusion)' } : undefined

  return (
    <div className="h-full bg-zinc-950 flex flex-col overflow-y-auto">
      {/* Linear-light Gaussian blur for diffusion. SVG filters default to
          color-interpolation-filters: linearRGB (set explicitly here), so the
          blur conserves energy and does not dim, unlike CSS blur() in sRGB. The
          generous filter region keeps a wide blur from clipping at the edges. */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter
            id="preview-diffusion"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            colorInterpolationFilters="linearRGB"
          >
            <feGaussianBlur stdDeviation={diffusionStdDev} />
          </filter>
        </defs>
      </svg>
      {/* Canvas flush at the top of the pane (#150): no header strip above it. The
          container drives the ResizeObserver fit; the deck stacks below. */}
      <div ref={containerRef} className="relative w-full shrink-0">
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            className="rounded-sm"
            style={diffusionFilter}
          />
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
