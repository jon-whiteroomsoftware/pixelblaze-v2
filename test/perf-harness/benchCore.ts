// Reusable emulator benchmark (#247). Times any demo in both Fast (float64) and
// Precise (16.16 fixed-point) modes and emits a stable pixel CHECKSUM, so an
// optimization pass can prove it changed the speed without changing the visual:
// re-run after an edit and compare the checksum (per mode) — equal ⇒ same output.
//
// IMPORTANT CAVEAT — what this does and does NOT measure.
// It measures OPERATION / CALL COUNT, not hardware per-function cost. Every math
// built-in is a native `Math.*` in BOTH shims (src/engine/shim.ts); Precise only
// adds a raw↔float quantization per call. So this bench rewards:
//   - fewer ops, fewer loop iterations
//   - factoring invariants out of render into beforeRender
// but it will NOT reward `sin`→`wave` or `sqrt`→`hypot` (it may even PENALIZE
// them, since here `wave` wraps `cos` and is strictly more work). True native
// costs come from the separate hardware profiler (test/perf-harness/profiler.ts
// → costs.md). Keep the two questions apart: this is "how many ops did I do",
// that is "how much does each op cost on the device".
//
// Pure module: no DOM, no React, no filesystem. The CLI half (bench.ts) reads
// the demo + library sources off disk and hands them here.

import { bundle } from '../../src/engine/bundle'
import { loadPattern, nativeDimension } from '../../src/engine/loadPattern'
import { createShim, createFxShim, type ShimContext } from '../../src/engine/shim'
import { createVirtualClock } from '../../src/engine/virtualClock'
import { createRenderLoop } from '../../src/engine/renderLoop'
// Import from the leaf modules, not the maps/ barrel: the index pulls in
// stockCatalogue, which uses Vite's import.meta.glob (unavailable under tsx).
import { createPlaneMap } from '../../src/engine/maps/plane'
import type { MapPoint } from '../../src/engine/maps/types'

export type BenchMode = 'fast' | 'precise'

export interface BenchOptions {
  /** Frames rendered per measured run (also the checksum window). Default 30. */
  frames?: number
  /** Warm-up frames discarded before timing. Default 3. */
  warmup?: number
  /** Per-frame virtual-clock advance, ms. Default 1000/60 (~60fps). */
  frameDeltaMs?: number
  /** Override the render grid. Defaults pick a sensible size per dimension. */
  grid?: GridSpec
}

/** A render surface. `rows`/`cols`/`layers` are the integer lattice; only the
 *  axes the demo's dimensionality uses are read. */
export interface GridSpec {
  rows: number
  cols: number
  layers?: number
}

export interface BenchResult {
  mode: BenchMode
  /** Mean wall-clock time per frame over the measured run, milliseconds. */
  meanFrameMs: number
  /** FNV-1a hash of the 8-bit-quantized RGB buffer over every measured frame.
   *  Stable across runs of identical code; changes iff the visual changes. */
  checksum: string
  frames: number
  pixelCount: number
  dimension: 1 | 2 | 3
  grid: GridSpec
}

export interface DriftMetrics {
  mode: BenchMode
  base: BenchResult
  candidate: BenchResult
  /** Total RGB channels compared: frames * pixels * 3. */
  channels: number
  /** Average absolute 8-bit channel delta, 0..255. */
  meanAbs: number
  /** Root-mean-square 8-bit channel delta, 0..255. */
  rmse: number
  /** 95th percentile absolute 8-bit channel delta, 0..255. */
  p95: number
  /** Largest absolute 8-bit channel delta, 0..255. */
  max: number
  /** Fraction of RGB channels whose absolute delta is >= threshold. */
  changedPct: number
  threshold: number
}

const DEFAULT_FRAMES = 30
const DEFAULT_WARMUP = 3
const DEFAULT_FRAME_DELTA_MS = 1000 / 60

// Per-dimension default grids: a 1D strip, a 2D plane, a 3D cube. Sized to
// exercise a few thousand pixels without making a run sluggish.
function defaultGrid(dim: 1 | 2 | 3): GridSpec {
  if (dim === 1) return { rows: 1, cols: 256 }
  if (dim === 3) return { rows: 12, cols: 12, layers: 12 }
  return { rows: 32, cols: 64 }
}

// Build the active map for a dimensionality. The render loop dispatches by each
// point's `sample` arity (render3D -> render2D -> render), so the arity MUST
// match the demo's highest render fn or its output slot falls back to a noop.
function buildMap(dim: 1 | 2 | 3, grid: GridSpec): MapPoint[] {
  if (dim === 1) {
    const n = Math.max(1, grid.cols * grid.rows)
    // 1D: index-only dispatch. Empty sample == the render(index) slot.
    return Array.from({ length: n }, () => ({ sample: [] as number[] }))
  }
  if (dim === 2) {
    return createPlaneMap({ rows: grid.rows, cols: grid.cols }).resolve(grid.rows * grid.cols)
  }
  // 3D: a uniform cube, coords normalized to 0..1 on each axis.
  const layers = grid.layers ?? grid.rows
  const pts: MapPoint[] = []
  const nx = grid.cols, ny = grid.rows, nz = layers
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        pts.push({
          sample: [
            nx === 1 ? 0 : x / (nx - 1),
            ny === 1 ? 0 : y / (ny - 1),
            nz === 1 ? 0 : z / (nz - 1),
          ],
        })
      }
    }
  }
  return pts
}

// FNV-1a (32-bit). Stable, order-sensitive, fast — exactly what a "did the
// pixels drift?" guard wants. 8-bit quantization absorbs the sub-ULP float
// noise between modes/machines while staying sensitive to any real change.
class Fnv1a {
  private h = 0x811c9dc5
  update(byte: number): void {
    this.h = Math.imul(this.h ^ (byte & 0xff), 0x01000193)
  }
  digest(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0')
  }
}

/**
 * Benchmark one demo in one numeric mode. Renders a warm-up burst, then times
 * `frames` frames from a freshly reset virtual clock, accumulating the pixel
 * checksum over exactly those measured frames so the hash is deterministic.
 */
export function benchOne(
  src: string,
  libraries: Record<string, string>,
  mode: BenchMode,
  options: BenchOptions = {},
): BenchResult {
  return renderSample(src, libraries, mode, options).result
}

export function compareVisualDrift(
  baseSrc: string,
  candidateSrc: string,
  libraries: Record<string, string>,
  mode: BenchMode,
  options: BenchOptions & { threshold?: number } = {},
): DriftMetrics {
  const base = renderSample(baseSrc, libraries, mode, options)
  const candidate = renderSample(candidateSrc, libraries, mode, options)
  if (base.bytes.length !== candidate.bytes.length) {
    throw new Error(`drift sample size mismatch: ${base.bytes.length} vs ${candidate.bytes.length}`)
  }

  const threshold = options.threshold ?? 2
  const diffs = new Uint8Array(base.bytes.length)
  let sumAbs = 0
  let sumSq = 0
  let max = 0
  let changed = 0
  for (let i = 0; i < base.bytes.length; i++) {
    const d = Math.abs(base.bytes[i] - candidate.bytes[i])
    diffs[i] = d
    sumAbs += d
    sumSq += d * d
    if (d > max) max = d
    if (d >= threshold) changed++
  }

  const sorted = Array.from(diffs).sort((a, b) => a - b)
  const p95 = sorted.length === 0 ? 0 : sorted[Math.ceil(sorted.length * 0.95) - 1]
  const channels = base.bytes.length

  return {
    mode,
    base: base.result,
    candidate: candidate.result,
    channels,
    meanAbs: channels === 0 ? 0 : sumAbs / channels,
    rmse: channels === 0 ? 0 : Math.sqrt(sumSq / channels),
    p95,
    max,
    changedPct: channels === 0 ? 0 : changed / channels,
    threshold,
  }
}

function renderSample(
  src: string,
  libraries: Record<string, string>,
  mode: BenchMode,
  options: BenchOptions = {},
): { result: BenchResult; bytes: Uint8Array } {
  const frames = options.frames ?? DEFAULT_FRAMES
  const warmup = options.warmup ?? DEFAULT_WARMUP
  const frameDelta = options.frameDeltaMs ?? DEFAULT_FRAME_DELTA_MS

  const { code, fxCode, metadata } = bundle(src, libraries)
  const dimension = nativeDimension(metadata.renderFns)
  const grid = options.grid ?? defaultGrid(dimension)
  const mapPoints = buildMap(dimension, grid)
  const pixelCount = mapPoints.length

  const clock = createVirtualClock()
  const shimConfig = {
    mapPoints,
    pixelCount,
    dimensions: dimension,
    getVirtualTime: () => clock.getTime(),
  }
  const shim: ShimContext = mode === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)
  const handle = loadPattern(mode === 'fast' ? code : fxCode, metadata, shim.builtins)

  const hash = new Fnv1a()
  const bytes = new Uint8Array(frames * pixelCount * 3)
  let offset = 0
  let accumulate = false
  const loop = createRenderLoop({
    handle,
    shim,
    clock,
    mapPoints,
    pixelCount,
    getSpeed: () => 1,
    getBrightness: () => 1,
    isDimmed: () => false,
    paint: (pixels) => {
      if (!accumulate) return
      for (let i = 0; i < pixels.length; i++) {
        const [r, g, b] = pixels[i]
        const qr = quant(r), qg = quant(g), qb = quant(b)
        hash.update(qr)
        hash.update(qg)
        hash.update(qb)
        bytes[offset++] = qr
        bytes[offset++] = qg
        bytes[offset++] = qb
      }
    },
  })

  // Warm up (JIT, first-frame allocations) without polluting the checksum.
  for (let i = 0; i < warmup; i++) loop.tick(frameDelta)

  // Measured run: reset the clock so the checksum starts from a fixed virtual
  // time, then time exactly `frames` frames.
  clock.reset()
  accumulate = true
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) loop.tick(frameDelta)
  const elapsed = performance.now() - t0

  return {
    result: {
      mode,
      meanFrameMs: elapsed / frames,
      checksum: hash.digest(),
      frames,
      pixelCount,
      dimension,
      grid,
    },
    bytes,
  }
}

/** Bench a demo in both Fast and Precise modes. */
export function benchDemo(
  src: string,
  libraries: Record<string, string>,
  options: BenchOptions = {},
): { fast: BenchResult; precise: BenchResult } {
  return {
    fast: benchOne(src, libraries, 'fast', options),
    precise: benchOne(src, libraries, 'precise', options),
  }
}

// Quantize a 0..1 channel to an 8-bit byte, clamping out-of-range output (paint
// brightness, additive blends) so the checksum stays defined.
function quant(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}
