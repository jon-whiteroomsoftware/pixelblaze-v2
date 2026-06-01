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

// Derive a cube lattice side (points per axis) from a bare pixel count: the
// stock cube has no aspect to honour, so it cubes up to the side nearest the
// count's cube root (ADR-0004 — the count is the knob, the map arranges it).
// Floored at 2 (a single-point cube has no extent) and capped so side³ stays
// under the freeze guard. The realized count is side³, which may differ from
// the requested count (e.g. 500 → side 8 → 512).
export function cubeSideForCount(n: number): number {
  const maxSide = Math.floor(Math.cbrt(MAX_PIXEL_COUNT))
  const side = Math.round(Math.cbrt(Math.max(1, Math.floor(n) || 1)))
  return Math.max(2, Math.min(maxSide, side))
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

// Drawn light-source diameter in pixels (the WebGL gl_PointSize) for the 2D
// path: the inter-dot pitch (`grid.spacing`) times the preview light-size
// fraction (ADR-0006). At lightSize 0.95 sources almost touch; it grows them in
// place WITHOUT resizing the canvas, so the grid always fits the pane
// (canvasSize is lightSize-independent).
export function pointSize(grid: Locked2DGrid, lightSize: number = 1): number {
  return Math.max(1, grid.spacing * lightSize)
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
// point of a FULL cube can sit from the centre. The default worst-case extent
// when no tighter model bound is supplied.
const HALF_DIAGONAL = 0.5 * Math.sqrt(3)

// Margin so the orbiting model never touches the canvas edge at any angle. The
// fit is on the model's bounding SPHERE about the rotation centre, so its
// silhouette is the same circle at every angle — only a thin margin is needed.
export const FIT_3D_MARGIN = 0.95

// The model's actual worst-case half-extent: the largest distance any point sits
// from the rotation centre (the fixed [0.5,0.5,0.5] that `projectOrbit` centres
// on). This is the radius of the bounding sphere, which is rotation-invariant —
// so fitting it makes the model fill the frame at every orientation without ever
// clipping, and a smaller model (e.g. a shorter pole) zooms in further. Falls
// back to the unit-cube diagonal for an empty set.
export function modelHalfExtent(
  positions: readonly (readonly [number, number, number])[],
  center: number = 0.5,
): number {
  let max = 0
  for (const [x, y, z] of positions) {
    const dx = x - center
    const dy = y - center
    const dz = z - center
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > max) max = d
  }
  return max > 0 ? max : HALF_DIAGONAL
}

// The scale taking centred [-0.5,0.5]³ coords into clip space such that the
// model's worst-case extent maps to ±margin — i.e. it always fits, spin or not.
// Square aspect (the 3D canvas is square); pure, no container arg needed beyond
// the margin since clip space is already normalized. `halfExtent` defaults to the
// unit-cube diagonal; pass the model's own bounding-sphere radius to fit tightly.
export function fit3DScale(
  margin: number = FIT_3D_MARGIN,
  halfExtent: number = HALF_DIAGONAL,
): number {
  return margin / halfExtent
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

// Map `projectOrbit`'s rotated depth to a WebGL clip-space z for the depth
// buffer, so 3D orbs render OPAQUE (nearer occludes farther) instead of
// additively blending into a translucent, washed-out field (ADR-0006: diffusion
// 0 must read as crisp, distinct sources). `projectOrbit` returns larger-z =
// nearer; the depth test keeps the SMALLEST z, so nearer maps to the smaller
// (front) clip z. Normalized by the model's worst-case half-extent so it spans
// [-1,1] front→back, clamped so a corner point can't fall outside the frustum.
export function orbitDepthToClipZ(
  depth: number,
  halfExtent: number = HALF_DIAGONAL,
): number {
  const z = -depth / halfExtent
  return z < -1 ? -1 : z > 1 ? 1 : z
}

// Inter-dot pitch of a side×side×side lattice, projected to canvas pixels: the
// screen-space distance between adjacent lattice points along one axis. The
// normalized axis pitch is 1/(side-1); `projectOrbit` scales it by `scale` into
// clip space, where the full [-1,1] span (2 units) covers `canvasPx` pixels. A
// degenerate single-cell axis has no pitch, so we fall back to the full extent.
export function lattice3DPitchPx(
  canvasPx: number,
  side: number,
  scale: number = fit3DScale(),
): number {
  const clipPitch = side > 1 ? scale / (side - 1) : scale
  return (clipPitch / 2) * canvasPx
}

// On-screen pixel pitch for a measured normalized inter-source spacing under the
// orbit camera: the spacing scaled into clip space (×scale) then to pixels (the
// clip span of 2 covers `canvasPx`). The general form of `lattice3DPitchPx`,
// which assumed a regular side×side lattice (spacing 1/(side-1)); this takes the
// actual neighbour spacing, so it is correct for ANY layout — solid cube, sphere
// shell, or wrapped curve alike (#63). A degenerate (single point / zero) spacing
// falls back to the full extent so a lone source still draws.
export function neighborPitchPx(
  canvasPx: number,
  spacingNorm: number,
  scale: number = fit3DScale(),
): number {
  const clipPitch = spacingNorm > 0 ? spacingNorm * scale : scale
  return (clipPitch / 2) * canvasPx
}

// The typical (median) nearest-neighbour distance among points in normalized
// space — the REAL inter-source pitch for any layout. A cube-root "lattice side"
// estimate is only right for a solid cubic lattice; for a sphere shell, a helix,
// or a wrapped pole the points sit on a 2D/1D manifold, so cbrt(count) wildly
// overestimates their on-screen neighbour gap and the orbs balloon (#63).
//
// Sampled for cost: for up to NN_SAMPLE_LIMIT stride-selected query points we
// take the exact nearest neighbour over the FULL set, then return the median of
// those — robust to a lone far point or a wrap seam. O(sample × N), run once per
// layout change (never per frame). Returns 0 for fewer than two points.
export const NN_SAMPLE_LIMIT = 1024
export function nearestNeighborSpacing(
  positions: readonly (readonly [number, number, number])[],
): number {
  const n = positions.length
  if (n < 2) return 0
  const stride = Math.max(1, Math.floor(n / NN_SAMPLE_LIMIT))
  const dists: number[] = []
  for (let i = 0; i < n; i += stride) {
    const [xi, yi, zi] = positions[i]
    let best = Infinity
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const dx = positions[j][0] - xi
      const dy = positions[j][1] - yi
      const dz = positions[j][2] - zi
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < best) best = d2
    }
    if (best < Infinity) dists.push(Math.sqrt(best))
  }
  if (dists.length === 0) return 0
  dists.sort((a, b) => a - b)
  return dists[dists.length >> 1]
}

// Drawn light-source diameter in pixels for a 3D layout (the un-cued base, before
// per-dot depth cueing): the measured neighbour pitch times the preview light-size
// fraction (ADR-0006), so "almost touching" (lightSize → 1) lands at the same felt
// point as the 2D plane across every layout (#63).
export function point3DSize(
  canvasPx: number,
  spacingNorm: number,
  lightSize: number,
  scale: number = fit3DScale(),
): number {
  return Math.max(1, neighborPitchPx(canvasPx, spacingNorm, scale) * lightSize)
}

// Default preview light size, and the store's initial value (ADR-0006).
export const DEFAULT_LIGHT_SIZE = 0.5

// Per-source diffusion glow (ADR-0006, revised twice). Diffusion is modelled as
// each light source's point-spread *widening* — a soft radial profile grown around
// the core — NOT a Gaussian blur of the whole rendered frame. A frame blur is a
// low-pass filter: it drains the bright cores, bleeds light past the array edge
// (the "furry" halo), and in 3D smears the orbiting silhouette. A per-source kernel
// instead never paints outside a source's own footprint and only fills the
// inter-source GAPS — what a physical diffuser sheet does.
//
// The first per-source revision kept each core CRISP and at full intensity for all
// diffusion levels. That honoured "never dims" but meant the solid bright disc — the
// pixel — was always visible, so 100% never read as "fully merged". This revision
// lets the core DISSOLVE as diffusion → 1: the solid full-intensity core shrinks to
// nothing and the whole source becomes a single smooth radial bump (a raised-cosine
// / Hann profile), which is what actually makes neighbouring sources fuse into a
// gap-free field at the top of the slider.
//
// Non-dimming is preserved by pinning the BRIGHTEST point. Each source's peak
// amplitude is normalised by how much its neighbours' tails pile onto a source
// centre (`peak = 1 / centre-overlap`): with no overlap (diffusion 0) peak is 1 and
// nothing changes; as the tails widen and overlap, peak eases down just enough that
// the brightest point stays ≈ the original core brightness while the formerly-dark
// gaps rise to meet it. The brightest feature never darkens and the field never
// blows out — gaps only fill upward.
//
// Given the drawn core diameter and the inter-source pitch (both px), this returns:
//   - `quadDiameterPx` — the grown gl.POINTS quad (the kernel's full footprint).
//   - `coreFrac`       — the solid full-amplitude core radius as a fraction of the
//                        quad half-width; 1 at diffusion 0, → 0 at diffusion 1.
//   - `peak`           — the source's peak amplitude after overlap normalisation;
//                        1 at diffusion 0.
// At diffusion 0 the quad equals the core, coreFrac is 1 and peak is 1, so the draw
// is bit-for-bit the pre-diffusion solid disc. `DIFFUSION_GLOW_REACH` is how far (in
// pitches) the tail extends beyond the source centre at diffusion 1; it must be wide
// enough (> 1 pitch, reaching diagonal neighbours) for the field to read fully
// merged at 100% — calibrated by eye.
export const DIFFUSION_GLOW_REACH = 1.4
export interface DiffusionGlow {
  quadDiameterPx: number
  coreFrac: number
  peak: number
}

// Unit-peak radial profile shared with the fragment shader: flat 1.0 inside the
// solid core (`q <= coreFrac`), then a raised-cosine (Hann) tail easing to 0 at the
// rim (`q = 1`). `q` is radius as a fraction of the quad half-width.
function glowProfile(q: number, coreFrac: number): number {
  if (q <= coreFrac) return 1
  if (q >= 1) return 0
  const s = (q - coreFrac) / Math.max(1e-4, 1 - coreFrac)
  return 0.5 * (1 + Math.cos(Math.PI * s))
}

// Sum of the unit-peak profile from a square screen lattice of the given pitch,
// sampled at a point `offsetPx` from one source's centre. offset 0 = a source
// centre (the brightest point, includes the self term 1); pitch/2 ≈ a gap. Used
// only to normalise peak; the on-screen kernel is 2D so this models 1D/2D/3D alike.
function latticeOverlap(quadRadiusPx: number, coreFrac: number, pitchPx: number, offsetPx: number): number {
  const span = Math.ceil(quadRadiusPx / pitchPx) + 1
  let sum = 0
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      const r = Math.hypot(i * pitchPx + offsetPx, j * pitchPx)
      if (r < quadRadiusPx) sum += glowProfile(r / quadRadiusPx, coreFrac)
    }
  }
  return sum
}

export function diffusionGlow(
  diffusion: number,
  coreDiameterPx: number,
  pitchPx: number,
): DiffusionGlow {
  const d = diffusion <= 0 ? 0 : diffusion >= 1 ? 1 : diffusion
  if (d === 0 || pitchPx <= 0 || coreDiameterPx <= 0) {
    return { quadDiameterPx: Math.max(1, coreDiameterPx), coreFrac: 1, peak: 1 }
  }
  const coreRadiusPx = coreDiameterPx / 2
  // The tail reaches d·REACH pitches past the source centre; the solid core melts
  // from its full radius down to 0 as diffusion → 1.
  const quadRadiusPx = coreRadiusPx + d * pitchPx * DIFFUSION_GLOW_REACH
  const solidCoreRadiusPx = coreRadiusPx * (1 - d)
  const coreFrac = solidCoreRadiusPx / quadRadiusPx
  // Pin the brightest point: peak·(overlap at a source centre) = 1.
  const peak = 1 / latticeOverlap(quadRadiusPx, coreFrac, pitchPx, 0)
  return { quadDiameterPx: 2 * quadRadiusPx, coreFrac, peak }
}

export interface DepthCue {
  brightnessMul: number
  sizeMul: number
}

// Depth cueing: nearer dots are brighter, so the orbit reads as 3D. `depth` is
// `projectOrbit`'s rotated z in [-HALF_DIAGONAL, +HALF_DIAGONAL]; t=0 is the
// farthest point, t=1 the nearest. Multipliers interpolate between the far and
// near ends.
//
// Size is NOT cued by default (nearSize === farSize): a depth-driven size
// gradient shrinks receding dots, which both (a) reads as a false keystone/
// perspective on the orthographic cube and (b) stops the lattice from packing
// tight at max light size the way the 2D plane does (#63). Brightness alone
// carries the depth read; size stays flat so 3D packs like 2D. Callers can still
// opt into a size gradient via nearSize/farSize.
export function depthCue(
  depth: number,
  opts: { nearBright?: number; farBright?: number; nearSize?: number; farSize?: number } = {},
  halfExtent: number = HALF_DIAGONAL,
): DepthCue {
  const { nearBright = 1, farBright = 0.4, nearSize = 1, farSize = 1 } = opts
  const t = clamp01((depth + halfExtent) / (2 * halfExtent))
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
