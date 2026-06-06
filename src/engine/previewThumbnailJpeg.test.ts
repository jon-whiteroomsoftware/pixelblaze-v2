import { describe, it, expect, vi, afterEach } from 'vitest'
import { bundle } from './bundle'
import { encodeWaterfallJpeg, buildPreviewJpeg } from './previewThumbnailJpeg'

// jsdom has no OffscreenCanvas/ImageData, so the canvas seam is stubbed. These tests
// cover the wiring (putImageData -> convertToBlob -> bytes) and the graceful-null
// fallback; real JPEG validity is checked on hardware (issue #259 verify step).

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubCanvas(jpegBytes: Uint8Array) {
  const putImageData = vi.fn()
  vi.stubGlobal('ImageData', class {
    data: Uint8ClampedArray
    constructor(public width: number, public height: number) {
      this.data = new Uint8ClampedArray(width * height * 4)
    }
  })
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { putImageData } }
    convertToBlob() { return Promise.resolve({ arrayBuffer: () => Promise.resolve(jpegBytes.buffer) }) }
  })
  return { putImageData }
}

describe('encodeWaterfallJpeg', () => {
  it('paints the buffer onto a canvas and returns the encoded bytes', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 9, 9, 0xff, 0xd9])
    const { putImageData } = stubCanvas(jpeg)
    const rgba = new Uint8ClampedArray(2 * 3 * 4)
    const out = await encodeWaterfallJpeg(rgba, 2, 3)
    expect(putImageData).toHaveBeenCalledOnce()
    expect(Array.from(out)).toEqual(Array.from(jpeg))
  })
})

describe('buildPreviewJpeg', () => {
  it('renders + encodes a pattern to JPEG bytes', async () => {
    stubCanvas(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    const src = bundle('export function render(index){ rgb(index/pixelCount,0,0) }', {})
    const out = await buildPreviewJpeg(src)
    expect(out).not.toBeNull()
    expect(out![0]).toBe(0xff)
  })

  it('returns null (not throw) when the canvas is unavailable', async () => {
    // No stub: OffscreenCanvas is undefined in jsdom, so encoding throws and is caught.
    const src = bundle('export function render(index){ rgb(0,0,0) }', {})
    expect(await buildPreviewJpeg(src)).toBeNull()
  })
})
