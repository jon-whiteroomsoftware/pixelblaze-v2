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
  // Auto-orbit armed: a slow azimuth turntable spin, on by default. Grabbing the
  // model disarms it (pauses); play/pause and reset re-arm it.
  autoOrbit: boolean
  setCamera: (camera: OrbitCamera) => void
  setAutoOrbit: (on: boolean) => void
  // Reset to the default three-quarter view and re-arm auto-orbit (undoes a
  // trackball roll). Used by the reset-view control and on opening a 3D layout.
  resetView: () => void
}

export const cameraInitialState = {
  camera: DEFAULT_ORBIT,
  autoOrbit: true,
}

export const useCameraStore = create<CameraState>((set) => ({
  ...cameraInitialState,
  setCamera: (camera) => set({ camera }),
  setAutoOrbit: (autoOrbit) => set({ autoOrbit }),
  resetView: () => set({ camera: DEFAULT_ORBIT, autoOrbit: true }),
}))
