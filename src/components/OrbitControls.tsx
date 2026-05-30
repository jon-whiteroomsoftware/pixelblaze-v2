import { useEffect, RefObject } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { useCameraStore } from '@/store/cameraStore'
import { applyTurntableDrag, applyTrackballDrag } from '@/engine/camera'

// 3D-display-only orbit viewport controls (#129). The component is a thin UI
// shell over the 3D viewport: all camera math is the pure `@/engine/camera`
// helpers, and the ephemeral angle/auto-orbit state lives in `cameraStore`.
//
// These control the VIEWPORT animation (the orbiting model), distinct from the
// header play/pause which runs the pattern itself.
//
// Interaction:
//   • plain drag   → turntable (horizontal = azimuth, vertical = clamped pitch)
//   • shift-drag   → free trackball (no clamp)
//   • grabbing the model pauses auto-orbit until re-armed (play/pause)
//   • reset returns to the default angle and re-arms auto-orbit
export function OrbitControls({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const autoOrbit = useCameraStore((s) => s.autoOrbit)
  const setAutoOrbit = useCameraStore((s) => s.setAutoOrbit)
  const resetView = useCameraStore((s) => s.resetView)

  // Pointer drag → orbit. Listeners read/write the camera via getState so a drag
  // never churns React; only the play/pause flag (above) is reactive.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let dragging = false
    let lastX = 0
    let lastY = 0
    let shift = false

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      shift = e.shiftKey
      // Grabbing the model pauses auto-orbit until re-armed.
      useCameraStore.getState().setAutoOrbit(false)
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const cam = useCameraStore.getState().camera
      // Screen-down drag should tilt the top toward the viewer → negate dy.
      const next = (e.shiftKey || shift)
        ? applyTrackballDrag(cam, dx, -dy)
        : applyTurntableDrag(cam, dx, -dy)
      useCameraStore.getState().setCamera(next)
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
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
        {autoOrbit ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button
        aria-label="Reset view"
        title="Reset view"
        onClick={resetView}
        className="flex items-center justify-center h-7 w-7 rounded bg-zinc-900/70 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  )
}
