import { useEffect, RefObject } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useCameraStore } from '@/store/cameraStore'
import { useMapStore, DEFAULT_SHAPE_PIXEL_COUNT } from '@/store/mapStore'
import {
  applyOrbitDrag,
  clampPixelCount,
} from '@/engine/camera'
import { poleMaxCols, defaultPoleCols, clampPoleCols } from '@/engine/shapes'

// 3D-display-only orbit viewport controls (#129). The component is a thin UI
// shell over the 3D viewport: all camera math is the pure `@/engine/camera`
// helpers, and the ephemeral angle/auto-orbit state lives in `cameraStore`.
//
// These control the VIEWPORT animation (the orbiting model), distinct from the
// header play/pause which runs the pattern itself.
//
// Interaction:
//   • drag         → orbit: horizontal yaws azimuth, vertical tilts pitch, both
//                    axes at once. Elevation is clamped to a stable horizon, so
//                    horizontal always reads as left/right (no view-axis roll).
//   • grabbing the model holds the spin still; it resumes on release. Only the
//     play/pause control toggles the persistent spinning/stopped state.
//   • reset returns to the default angle and re-arms auto-orbit
export function OrbitControls({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const autoOrbit = useCameraStore((s) => s.autoOrbit)
  const setAutoOrbit = useCameraStore((s) => s.setAutoOrbit)
  const resetView = useCameraStore((s) => s.resetView)

  // Pole wrap-density slider (#146): only the Pole shape exposes it. The slider
  // sets pixels-per-wrap; the pole's diameter and length follow (square cells),
  // trading fat-and-short (more cols) for thin-and-tall (fewer). Range is clamped
  // to the taller-than-wide regime for the current pixel count.
  const poleCols = useCameraStore((s) => s.poleCols)
  const setPoleCols = useCameraStore((s) => s.setPoleCols)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const isPole = activeShapeId === 'pole'
  const poleCount = clampPixelCount(activePixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
  const poleMax = poleMaxCols(poleCount)
  const poleValue = clampPoleCols(poleCount, poleCols ?? defaultPoleCols(poleCount))

  // Pointer drag → orbit. Listeners read/write the camera via getState so a drag
  // never churns React; only the play/pause flag (above) is reactive.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let dragging = false
    let lastX = 0
    let lastY = 0

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      // Grabbing the model holds the auto-orbit spin still; it resumes on release.
      // The persistent armed state is only changed by the play/pause control.
      useCameraStore.getState().setDragging(true)
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const cam = useCameraStore.getState().camera
      // Drag-down tilts the model's top toward the viewer (dy as-is).
      useCameraStore.getState().setCamera(applyOrbitDrag(cam, dx, dy))
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      // Release resumes the spin (if it was armed); the persistent state is untouched.
      useCameraStore.getState().setDragging(false)
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.style.cursor = 'grab'
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.style.cursor = ''
    }
  }, [canvasRef])

  return (
    <div className="absolute top-2 right-2 flex gap-1">
      <button
        aria-label={autoOrbit ? 'Pause auto-orbit' : 'Resume auto-orbit'}
        title={autoOrbit ? 'Pause auto-orbit' : 'Resume auto-orbit'}
        onClick={() => setAutoOrbit(!autoOrbit)}
        className="flex items-center justify-center h-7 w-7 rounded bg-zinc-900/70 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
      >
        {/* Current-state semantics (matches the header pattern play/pause): the icon
            shows what's happening now — Play while orbiting, Pause when stopped. */}
        {autoOrbit ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button
        aria-label="Reset view"
        title="Reset view"
        onClick={resetView}
        className="flex items-center justify-center h-7 w-7 rounded bg-zinc-900/70 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
      >
        <RotateCcw size={14} />
      </button>
      {isPole && (
        <label
          title="Pole wrap density"
          className="flex items-center h-7 px-2 rounded bg-zinc-900/70"
        >
          <input
            type="range"
            aria-label="Pole wrap density"
            min={2}
            max={poleMax}
            step={1}
            value={poleValue}
            onChange={(e) => setPoleCols(Number(e.target.value))}
            className="w-16 h-1 accent-amber-400 cursor-pointer"
          />
        </label>
      )}
    </div>
  )
}
