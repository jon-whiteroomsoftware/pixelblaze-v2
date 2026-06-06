// Saved-pattern preview thumbnail (#259). A pattern saved to a Controller carries
// an optional JPEG preview in its PBP blob; without it the stock ElectroMage web
// app's pattern list stalls 10s per previewless pattern (sequential getPreviewImg
// with a 10s timeout) and throws "trouble loading preview images". We mirror the
// device's own preview so our saves slot into the list cleanly.
//
// FORMAT (ground truth — pulled off a bench device, see issue #259): every device
// preview is a fixed 100x150 JPEG. It is NOT a snapshot of the 2D grid render — it
// is a 1D-strip WATERFALL:
//   - width  = 100 columns: a fixed 100-pixel 1D strip, one column per LED index
//     (independent of the real pixel count — a 16x16 matrix still previews 100 wide).
//   - height = 150 rows: 150 successive frame iterations, time flowing top->bottom.
// Higher-dim patterns mirror the device's own dispatch: the highest render fn the
// pattern exports, fed the strip coords with only X varying (Y/Z pinned to 0). That
// falls out for free here — every strip sample has arity 3, so dispatch always goes
// through handle.render3D, whose fallback chain (render3D->render2D->render->noop,
// loadPattern.ts) cascades to the pattern's actual highest render fn.
//
// This module is the PURE half: it produces the raw RGBA waterfall buffer with zero
// DOM/React. JPEG encoding (which needs a canvas) lives at the engine/UI seam in
// previewThumbnailJpeg.ts.

import { createShim, createFxShim } from './shim'
import { loadPattern, nativeDimension } from './loadPattern'
import type { BundleMetadata } from './bundle'
import { createVirtualClock } from './virtualClock'
import { createRenderLoop } from './renderLoop'
import type { MapPoint } from './maps/types'

/** Device-matched waterfall dimensions and the per-row frame step. */
export const PREVIEW_WIDTH = 100
export const PREVIEW_HEIGHT = 150
// One row == one frame iteration. The device uses its own frame cadence; a fixed
// ~60fps step per row is representative and keeps animated patterns legible over
// the 150 rows. Fidelity here is cosmetic — the bug fix only needs a decodable JPEG.
export const PREVIEW_FRAME_DELTA_MS = 1000 / 60

/** The subset of a bundle() result the waterfall needs. */
export interface WaterfallSource {
  code: string
  fxCode: string
  metadata: BundleMetadata
}

export interface WaterfallOptions {
  width?: number
  height?: number
  /** Match the live preview's numeric domain. Defaults to 'precise' (16.16 fixed
   *  point), the device-faithful arithmetic. */
  fidelity?: 'fast' | 'precise'
  frameDeltaMs?: number
}

/** Render the pattern to a width×height RGBA waterfall (row-major, 4 bytes/pixel,
 *  0..255). Pure: no DOM, no React. Throws if the pattern fails to load — callers
 *  should fall back to an empty preview section rather than block a save. */
export function renderPreviewWaterfall(
  source: WaterfallSource,
  options: WaterfallOptions = {},
): Uint8ClampedArray {
  const width = options.width ?? PREVIEW_WIDTH
  const height = options.height ?? PREVIEW_HEIGHT
  const fidelity = options.fidelity ?? 'precise'
  const frameDelta = options.frameDeltaMs ?? PREVIEW_FRAME_DELTA_MS

  // A synthetic 100-pixel 1D strip: every sample is a 3-coord [x,0,0] with x = i/width,
  // so render dispatch always hits render3D and cascades to the pattern's highest fn.
  const mapPoints: MapPoint[] = Array.from({ length: width }, (_, i) => ({
    sample: [i / width, 0, 0],
  }))

  const clock = createVirtualClock()
  const shimConfig = {
    mapPoints,
    pixelCount: width,
    dimensions: nativeDimension(source.metadata.renderFns),
    getVirtualTime: () => clock.getTime(),
  }
  const shim = fidelity === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)
  const handle = loadPattern(
    fidelity === 'fast' ? source.code : source.fxCode,
    source.metadata,
    shim.builtins,
  )

  const rgba = new Uint8ClampedArray(width * height * 4)
  let row = 0

  const loop = createRenderLoop({
    handle,
    shim,
    clock,
    mapPoints,
    pixelCount: width,
    getSpeed: () => 1,
    getBrightness: () => 1,
    isDimmed: () => false,
    paint: (pixels) => {
      const base = row * width * 4
      for (let col = 0; col < width; col++) {
        const [r, g, b] = pixels[col] ?? [0, 0, 0]
        const o = base + col * 4
        rgba[o] = r * 255
        rgba[o + 1] = g * 255
        rgba[o + 2] = b * 255
        rgba[o + 3] = 255
      }
    },
  })

  for (row = 0; row < height; row++) {
    loop.tick(frameDelta)
  }

  return rgba
}
