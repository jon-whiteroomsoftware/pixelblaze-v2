// Engine/UI seam for the saved-pattern preview thumbnail (#259): encode the pure
// RGBA waterfall buffer (renderPreviewWaterfall) to a JPEG byte array. This needs a
// canvas, so it is browser-only and kept out of the pure waterfall module.

import { renderPreviewWaterfall, PREVIEW_WIDTH, PREVIEW_HEIGHT, type WaterfallSource } from './previewThumbnail'

// ~0.8 mirrors the device's ~3.5-9KB output sizes (the exact value lives only in the
// device JS bundle). Cosmetic for the bug fix — the stock loader only needs a JPEG it
// can decode.
const JPEG_QUALITY = 0.8

/** Encode a width×height RGBA buffer (0..255, row-major) to JPEG bytes. */
export async function encodeWaterfallJpeg(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quality: number = JPEG_QUALITY,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D context for preview JPEG encode')
  const imageData = new ImageData(width, height)
  imageData.data.set(rgba)
  ctx.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Uint8Array(await blob.arrayBuffer())
}

/** Render the pattern's 100x150 waterfall and encode it to a preview JPEG. Returns
 *  the JPEG bytes, or null if rendering/encoding fails (so a save falls back to an
 *  empty preview section rather than aborting). */
export async function buildPreviewJpeg(source: WaterfallSource): Promise<Uint8Array | null> {
  try {
    const rgba = renderPreviewWaterfall(source)
    return await encodeWaterfallJpeg(rgba, PREVIEW_WIDTH, PREVIEW_HEIGHT)
  } catch {
    return null
  }
}
