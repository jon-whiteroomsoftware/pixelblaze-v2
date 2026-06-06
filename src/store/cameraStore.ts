import { create } from 'zustand'
import { DEFAULT_ORBIT, type OrbitCamera } from '@/engine/camera'

// Ephemeral 3D-orbit camera state (#129): never persisted. The angle and the
// auto-orbit armed/paused flag live only for the session — reset-view restores
// the default angle and auto-orbit re-arms whenever a 3D layout opens.
//
// Kept in a framework-agnostic store (not React state) because the render loop
// reads/advances it outside React, exactly like previewStore.

interface CameraState {
  camera: OrbitCamera
  // Auto-orbit armed: a slow azimuth turntable spin, on by default. This is the
  // persistent intent — ONLY the play/pause control and reset change it. Grabbing
  // the model does NOT disarm it; it pauses transiently via `dragging` instead.
  autoOrbit: boolean
  // Transient drag suppression: true only while the user is actively dragging the
  // model. The spin is held still during a drag and resumes on release, so a drag
  // never flips the persistent armed state.
  dragging: boolean
  // Pole wrap density (#146): pixels per wrap around the cylinder. `null` means
  // "use the shape's taller-than-wide default for the current pixel count"; an
  // explicit value is the slider's chosen column count (clamped on use). Ephemeral
  // like the camera — a view affordance, never persisted.
  poleCols: number | null
  setCamera: (camera: OrbitCamera) => void
  setAutoOrbit: (on: boolean) => void
  setDragging: (on: boolean) => void
  setPoleCols: (cols: number | null) => void
  // Reset to the default three-quarter view and re-arm auto-orbit (undoes a
  // trackball roll). Used by the reset-view control and on opening a 3D layout.
  resetView: () => void
}

export const cameraInitialState = {
  camera: DEFAULT_ORBIT,
  autoOrbit: true,
  dragging: false,
  poleCols: null as number | null,
}

export const useCameraStore = create<CameraState>((set) => ({
  ...cameraInitialState,
  setCamera: (camera) => set({ camera }),
  setAutoOrbit: (autoOrbit) => set({ autoOrbit }),
  setDragging: (dragging) => set({ dragging }),
  setPoleCols: (poleCols) => set({ poleCols }),
  resetView: () => set({ camera: DEFAULT_ORBIT, autoOrbit: true }),
}))
