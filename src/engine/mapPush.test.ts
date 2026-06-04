import { describe, it, expect } from 'vitest'
import { encodeMapData, resolveMapPushPoints } from './mapPush'

// The reference format (pixelblaze-client createMapData) for v3 firmware:
//   formatVersion = 2 → maxInt = 65535, 2 bytes per coordinate (uint16 LE).
//   header: u32LE(formatVersion), u32LE(numDimensions), u32LE(numPixels*numDims*fv).
const HEADER_BYTES = 12

function readU32(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(off, true)
}
function readU16(b: Uint8Array, off: number): number {
  return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(off, true)
}

describe('encodeMapData', () => {
  it('writes the v3 header: formatVersion 2, dimensions, and payload byte length', () => {
    const points = [
      [0, 0],
      [1, 1],
    ]
    const data = encodeMapData(points)
    expect(readU32(data, 0)).toBe(2) // formatVersion
    expect(readU32(data, 4)).toBe(2) // numDimensions
    expect(readU32(data, 8)).toBe(2 * 2 * 2) // numPixels * numDims * formatVersion
  })

  it('encodes normalized [0,1] coords as uint16 LE scaled to 0..65535 (no per-axis renorm)', () => {
    const data = encodeMapData([
      [0, 1],
      [0.5, 0.25],
    ])
    // pixel 0
    expect(readU16(data, HEADER_BYTES + 0)).toBe(0)
    expect(readU16(data, HEADER_BYTES + 2)).toBe(65535)
    // pixel 1: 0.5*65535 ≈ 32768 (rounded), 0.25*65535 ≈ 16384
    expect(readU16(data, HEADER_BYTES + 4)).toBe(Math.round(0.5 * 65535))
    expect(readU16(data, HEADER_BYTES + 6)).toBe(Math.round(0.25 * 65535))
  })

  it('preserves Contain aspect: a short axis under 1.0 is NOT stretched to full range', () => {
    // A Contain-normalized 2:1 map: x spans [0,1], y only reaches 0.5. The device's
    // own client would per-axis renormalize (Fill); we deliberately do not, so what
    // the preview shows is what the device gets.
    const data = encodeMapData([
      [0, 0],
      [1, 0.5],
    ])
    expect(readU16(data, HEADER_BYTES + 6)).toBe(Math.round(0.5 * 65535))
  })

  it('clamps out-of-range coords into [0,1]', () => {
    const data = encodeMapData([[-0.5, 1.5]])
    expect(readU16(data, HEADER_BYTES + 0)).toBe(0)
    expect(readU16(data, HEADER_BYTES + 2)).toBe(65535)
  })

  it('handles 3D maps (arity 3)', () => {
    const data = encodeMapData([[0, 0.5, 1]])
    expect(readU32(data, 4)).toBe(3)
    expect(readU32(data, 8)).toBe(1 * 3 * 2)
    expect(data.length).toBe(HEADER_BYTES + 3 * 2)
  })

  it('produces a total length of header + numPixels*numDims*formatVersion', () => {
    const points = Array.from({ length: 256 }, (_, i) => [i / 255, 0])
    const data = encodeMapData(points)
    expect(data.length).toBe(HEADER_BYTES + 256 * 2 * 2)
  })

  it('rejects an empty coordinate array', () => {
    expect(() => encodeMapData([])).toThrow()
  })

  it('rejects mixed-arity coordinates', () => {
    expect(() => encodeMapData([[0, 0], [0, 0, 0]])).toThrow()
  })

  it('rejects an unsupported arity', () => {
    expect(() => encodeMapData([[0, 0, 0, 0]])).toThrow()
  })

  it('supports formatVersion 1 (v2 firmware): 1 byte per coord, maxInt 255', () => {
    const data = encodeMapData([[0, 1]], { formatVersion: 1 })
    expect(readU32(data, 0)).toBe(1)
    expect(data.length).toBe(HEADER_BYTES + 2 * 1)
    expect(data[HEADER_BYTES + 0]).toBe(0)
    expect(data[HEADER_BYTES + 1]).toBe(255)
  })
})

describe('resolveMapPushPoints', () => {
  // A 1D map source that returns exactly `pixelCount` evenly-spaced coords — the
  // count is honoured, so re-baking yields a different-sized array per device.
  const source = `function (pixelCount) {
    var p = []
    for (var i = 0; i < pixelCount; i++) p.push([i, 0])
    return p
  }`
  // Stand-in for the preview-baked array (baked at the preview count, e.g. 4096).
  const previewBaked = Array.from({ length: 4096 }, (_, i) => [i / 4095, 0])

  it('re-bakes the map source to the device pixel count (the #204 fix)', () => {
    const points = resolveMapPushPoints(source, previewBaked, 256)
    // The firmware needs exactly pixelCount entries; a 4096-point blob to a
    // 256-pixel device is dropped wholesale. Re-baking pins the count to 256.
    expect(points.length).toBe(256)
  })

  it('falls back to the preview-baked points when the device count is unknown', () => {
    const points = resolveMapPushPoints(source, previewBaked, null)
    expect(points).toBe(previewBaked)
  })

  it('falls back when there is no source to re-bake', () => {
    const points = resolveMapPushPoints(undefined, previewBaked, 256)
    expect(points).toBe(previewBaked)
  })

  it('falls back when the source fails to evaluate', () => {
    const points = resolveMapPushPoints('function (n) { throw new Error("boom") }', previewBaked, 256)
    expect(points).toBe(previewBaked)
  })

  it('falls back when re-baking yields no points', () => {
    const points = resolveMapPushPoints('function (n) { return [] }', previewBaked, 256)
    expect(points).toBe(previewBaked)
  })
})
