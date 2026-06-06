import { describe, it, expect } from 'vitest'
import { bundle } from './bundle'
import {
  renderPreviewWaterfall,
  PREVIEW_WIDTH,
  PREVIEW_HEIGHT,
} from './previewThumbnail'

// Read the RGBA tuple at (col, row) from a row-major width*height*4 buffer.
function pixelAt(rgba: Uint8ClampedArray, width: number, col: number, row: number): number[] {
  const o = (row * width + col) * 4
  return [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]]
}

describe('renderPreviewWaterfall', () => {
  it('produces an exactly 100x150 RGBA buffer', () => {
    const src = bundle('export function render(index){ rgb(0,0,0) }', {})
    const rgba = renderPreviewWaterfall(src)
    expect(rgba.length).toBe(PREVIEW_WIDTH * PREVIEW_HEIGHT * 4)
  })

  it('renders a 1D pattern across the 100-pixel strip (column == LED index)', () => {
    // render(index) reads the LED index only; rgb(index/pixelCount,0,0) ramps red
    // left->right. pixelCount is the strip width (100). Alpha is always opaque.
    const src = bundle('export function render(index){ rgb(index/pixelCount, 0, 0) }', {})
    const rgba = renderPreviewWaterfall(src, { fidelity: 'fast' })
    // i/100 * 255 is integral at i=20 (51) and i=40 (102); avoids rounding ties.
    expect(pixelAt(rgba, PREVIEW_WIDTH, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixelAt(rgba, PREVIEW_WIDTH, 20, 0)).toEqual([51, 0, 0, 255])
    expect(pixelAt(rgba, PREVIEW_WIDTH, 40, 99)).toEqual([102, 0, 0, 255])
  })

  it('renders a 2D-only pattern via the 2D path with X varying, Y pinned', () => {
    // No render()/render3D — the strip's [x,0,0] sample falls through render3D->render2D.
    // rgb(x,0,0) ramps with x=i/width; rgb(0,y,0) would stay black (y pinned to 0).
    const src = bundle('export function render2D(index, x, y){ rgb(x, y, 0) }', {})
    const rgba = renderPreviewWaterfall(src, { fidelity: 'fast' })
    expect(pixelAt(rgba, PREVIEW_WIDTH, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixelAt(rgba, PREVIEW_WIDTH, 40, 0)).toEqual([102, 0, 0, 255]) // red = x = 40/100
    // green channel is y, pinned to 0 everywhere
    for (let row = 0; row < PREVIEW_HEIGHT; row += 50) {
      expect(pixelAt(rgba, PREVIEW_WIDTH, 60, row)[1]).toBe(0)
    }
  })

  it('renders a 3D-only pattern via the 3D path', () => {
    const src = bundle('export function render3D(index, x, y, z){ rgb(x, 0, 0) }', {})
    const rgba = renderPreviewWaterfall(src, { fidelity: 'fast' })
    expect(pixelAt(rgba, PREVIEW_WIDTH, 40, 0)).toEqual([102, 0, 0, 255])
  })

  it('runs in the default Precise fidelity and yields a coherent ramp', () => {
    const src = bundle('export function render(index){ rgb(index/pixelCount, 0, 0) }', {})
    const rgba = renderPreviewWaterfall(src)
    // Fixed-point rounding may shift a unit, so assert monotone-ish bounds, not exact.
    expect(pixelAt(rgba, PREVIEW_WIDTH, 0, 0)[0]).toBe(0)
    expect(pixelAt(rgba, PREVIEW_WIDTH, 80, 0)[0]).toBeGreaterThan(pixelAt(rgba, PREVIEW_WIDTH, 20, 0)[0])
  })
})
