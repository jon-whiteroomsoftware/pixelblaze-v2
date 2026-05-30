// Pure projection module for the preview's spatial layer (no DOM/React).
//
// This is the real test target behind the WebGL `renderer.ts` wrapper. It owns
// the locked-2D orthographic top-down camera: mapping a row-major pixel index
// to WebGL clip space, fit-to-container spacing, the canvas size, and the dot
// point size. The mapping is coordinate-identical to the legacy Canvas-2D grid
// (`cx = col*spacing + spacing/2`), so revealing it costs no visible change.
//
// Later slices add an orbitable 3D camera and arbitrary `pos` projection; for
// now the only exposed mode is the degenerate locked-2D case.

// Freeze guard: a single total-pixelCount ceiling, dimension-agnostic. A
// runaway count (e.g. a stale persisted blob, or a 3D map at 256³) would size
// the draw loop to something that locks the tab, so the renderer caps to this.
// 256² = 65,536 keeps the effective 2D maximum unchanged.
export const MAX_PIXEL_COUNT = 65536

// Per-axis cap kept by generators (e.g. the stock plane) so no single axis can
// balloon a map toward the total ceiling. Not the freeze guard itself.
export const MAX_GRID_AXIS = 256

// Clamp a single generator axis (rows/cols) to a sane per-axis ceiling.
export function clampGridDim(n: number): number {
  return Math.max(1, Math.min(MAX_GRID_AXIS, Math.floor(n) || 1))
}

// Clamp a total pixel count to the freeze-guard ceiling.
export function clampPixelCount(n: number): number {
  return Math.max(1, Math.min(MAX_PIXEL_COUNT, Math.floor(n) || 1))
}

export interface Locked2DGrid {
  rows: number
  cols: number
  spacing: number
}

// Canvas size in CSS pixels: cols×rows of dots at `spacing` apart, the dots
// filling the canvas exactly as the legacy grid did.
export function canvasSize(grid: Locked2DGrid): { width: number; height: number } {
  return {
    width: Math.round(grid.cols * grid.spacing),
    height: Math.round(grid.rows * grid.spacing),
  }
}

// Fit-to-container: the uniform spacing that makes `cols` dots span the
// available container width (matches Preview.tsx's ResizeObserver derivation).
export function fitSpacing(containerWidth: number, cols: number): number {
  return Math.max(1, containerWidth / Math.max(1, cols))
}

// Dot diameter in pixels — at scale 1 dots just touch their neighbours (legacy
// radius was max(0.5, spacing/2); diameter is the WebGL gl_PointSize). `scale`
// is the user's Spacing knob: it grows/shrinks the dots WITHOUT resizing the
// canvas, so the grid always fits the pane (canvasSize is scale-independent).
export function pointSize(grid: Locked2DGrid, scale: number = 1): number {
  return Math.max(1, grid.spacing * scale)
}

// Project a row-major grid index to WebGL clip space [-1,1]² (y axis up), or
// null if the index falls beyond the grid's row count. Spacing-independent: it
// cancels out of the clip mapping, so this is purely the dot centre as a
// fraction of the grid, matching the legacy `(col+0.5)/cols` dot centres.
export function projectIndex(index: number, grid: Locked2DGrid): [number, number] | null {
  const { rows, cols } = grid
  const col = index % cols
  const row = Math.floor(index / cols)
  if (row >= rows) return null
  const x = ((col + 0.5) / cols) * 2 - 1
  const y = 1 - ((row + 0.5) / rows) * 2
  return [x, y]
}

// Project a normalized [0,1]² display position (a map's intrinsic `pos`, or a
// viewport shape embedding) into WebGL clip space [-1,1]² with the y axis up.
// The locked-2D camera's pos path, parallel to the index path above; unlike
// `projectIndex` it draws wherever `pos` says, so it carries 1D shapes (line,
// ring) and any non-grid layout.
export function projectPos(pos: [number, number]): [number, number] {
  return [pos[0] * 2 - 1, 1 - pos[1] * 2]
}

// ── Orbit camera (3D) ───────────────────────────────────────────────────────
//
// The 3D-display half of the preview camera (#129). Pure: the renderer wraps
// these in WebGL, but all geometry — rotation, orthographic projection, depth
// cueing, and fit-to-container — lives and is unit-tested here.
//
// Coordinate convention: a map's 3D `pos` is normalized [0,1]³ (parallel to the
// 2D plane). The camera centres it to [-0.5,0.5]³ about the model centroid,
// rotates, then scales into clip space. The view looks down -Z, so a larger
// rotated z is NEARER the camera (drives depth cueing).

type Vec3 = [number, number, number]

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export interface OrbitCamera {
  azimuth: number // turntable yaw about the vertical (Y) axis, radians
  elevation: number // pitch about X, radians; clamped for the turntable horizon
  roll: number // about the view (Z) axis, radians; only a trackball sets this
}

// Default three-quarter view: a gentle yaw and downward tilt so all three axes
// read on open. reset-view returns here; auto-orbit advances `azimuth` from it.
export const DEFAULT_ORBIT: OrbitCamera = { azimuth: 0.6, elevation: 0.5, roll: 0 }

// Turntable elevation clamp — just shy of straight down/up so the horizon stays
// stable (no gimbal flip). Plain drag is clamped to this; trackball is free.
export const MAX_ELEVATION = (Math.PI / 2) * 0.98

export function clampElevation(e: number): number {
  return Math.max(-MAX_ELEVATION, Math.min(MAX_ELEVATION, e))
}

// Rotate a centred point by the camera orientation: Rz(roll)·Rx(elevation)·Ry(azimuth).
export function orbitRotate(p: Vec3, cam: OrbitCamera): Vec3 {
  const [x, y, z] = p
  // Ry(azimuth)
  const ca = Math.cos(cam.azimuth)
  const sa = Math.sin(cam.azimuth)
  const x1 = ca * x + sa * z
  const y1 = y
  const z1 = -sa * x + ca * z
  // Rx(elevation)
  const ce = Math.cos(cam.elevation)
  const se = Math.sin(cam.elevation)
  const x2 = x1
  const y2 = ce * y1 - se * z1
  const z2 = se * y1 + ce * z1
  // Rz(roll)
  const cr = Math.cos(cam.roll)
  const sr = Math.sin(cam.roll)
  return [cr * x2 - sr * y2, sr * x2 + cr * y2, z2]
}

// Half the space diagonal of the centred unit cube — the largest distance any
// point can sit from the centre, hence the worst-case extent under any rotation.
const HALF_DIAGONAL = 0.5 * Math.sqrt(3)

// Margin so the orbiting model never touches the canvas edge at any angle.
export const FIT_3D_MARGIN = 0.9

// The scale taking centred [-0.5,0.5]³ coords into clip space such that the
// model's worst-case extent maps to ±margin — i.e. it always fits, spin or not.
// Square aspect (the 3D canvas is square); pure, no container arg needed beyond
// the margin since clip space is already normalized.
export function fit3DScale(margin: number = FIT_3D_MARGIN): number {
  return margin / HALF_DIAGONAL
}

// Orthographic projection of a normalized [0,1]³ position through the orbit
// camera: returns clip-space (x,y) (y up) and the rotated depth (larger = nearer).
export function projectOrbit(
  pos: Vec3,
  cam: OrbitCamera,
  scale: number = fit3DScale(),
): { clip: [number, number]; depth: number } {
  const centred: Vec3 = [pos[0] - 0.5, pos[1] - 0.5, pos[2] - 0.5]
  const [rx, ry, rz] = orbitRotate(centred, cam)
  return { clip: [rx * scale, ry * scale], depth: rz }
}

export interface DepthCue {
  brightnessMul: number
  sizeMul: number
}

// Depth cueing: nearer dots are larger and brighter, so the orbit reads as 3D
// despite order-independent additive blending. `depth` is `projectOrbit`'s
// rotated z in [-HALF_DIAGONAL, +HALF_DIAGONAL]; t=0 is the farthest point,
// t=1 the nearest. Multipliers interpolate between the far and near ends.
export function depthCue(
  depth: number,
  opts: { nearBright?: number; farBright?: number; nearSize?: number; farSize?: number } = {},
): DepthCue {
  const { nearBright = 1, farBright = 0.4, nearSize = 1, farSize = 0.55 } = opts
  const t = clamp01((depth + HALF_DIAGONAL) / (2 * HALF_DIAGONAL))
  return {
    brightnessMul: farBright + (nearBright - farBright) * t,
    sizeMul: farSize + (nearSize - farSize) * t,
  }
}

// ── Orbit interaction (pure drag math) ──────────────────────────────────────

// Plain drag is constrained to a single cardinal axis (the spec): one gesture
// either yaws or pitches, never both. `dominantAxis` picks which from the
// gesture's accumulated travel; the caller locks it for the rest of the drag.
// 'x' → horizontal → azimuth; 'y' → vertical → elevation. Ties favour 'x'.
export type DragAxis = 'x' | 'y'

export function dominantAxis(dx: number, dy: number): DragAxis {
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
}

// Plain drag = turntable: horizontal pixels yaw azimuth, vertical pixels pitch
// elevation (clamped to a stable horizon). Roll is untouched.
export function applyTurntableDrag(
  cam: OrbitCamera,
  dx: number,
  dy: number,
  sensitivity: number = 0.01,
): OrbitCamera {
  return {
    azimuth: cam.azimuth + dx * sensitivity,
    elevation: clampElevation(cam.elevation + dy * sensitivity),
    roll: cam.roll,
  }
}

// Shift-drag = free trackball: horizontal yaws, vertical pitches WITHOUT clamp,
// so the model can tumble past vertical and accumulate roll-like freedom.
export function applyTrackballDrag(
  cam: OrbitCamera,
  dx: number,
  dy: number,
  sensitivity: number = 0.01,
): OrbitCamera {
  return {
    azimuth: cam.azimuth + dx * sensitivity,
    elevation: cam.elevation + dy * sensitivity,
    roll: cam.roll,
  }
}

// Auto-orbit: advance the azimuth turntable by `delta` ms at `speed` rad/sec.
export function advanceAutoOrbit(cam: OrbitCamera, deltaMs: number, speed: number = 0.3): OrbitCamera {
  return { ...cam, azimuth: cam.azimuth + (deltaMs / 1000) * speed }
}
