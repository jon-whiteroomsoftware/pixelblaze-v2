import { describe, it, expect } from 'vitest'
import {
  encodePbp,
  decodePbp,
  encodePbpSourceSection,
  decodePbpSource,
  PBP_HEADER_SIZE,
  PBP_VERSION,
} from './pbpEncode'

// A reconciling bytecode-ish blob — the encoder is opaque to bytecode validity, so
// any bytes serve as the bytecode section.
function fakeBytecode(): Uint8Array {
  return Uint8Array.from([1, 2, 3, 4, 5])
}

function readHeader(blob: Uint8Array): number[] {
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  return Array.from({ length: 9 }, (_, i) => dv.getUint32(i * 4, true))
}

describe('encodePbp', () => {
  it('writes a 9-uint32 header whose offsets/lengths reconcile to the total length', () => {
    const byteCode = fakeBytecode()
    const blob = encodePbp({
      id: 'ABCDEFGHJKLMNPQRS',
      name: 'My Pattern',
      sourceCode: 'export function render(i){}',
      byteCode,
    })
    const [
      version,
      nameOff,
      nameLen,
      jpegOff,
      jpegLen,
      bcOff,
      bcLen,
      srcOff,
      srcLen,
    ] = readHeader(blob)

    expect(version).toBe(PBP_VERSION)
    // First section starts right after the header.
    expect(nameOff).toBe(PBP_HEADER_SIZE)
    // Each section is contiguous: offset == previous offset + previous length.
    expect(jpegOff).toBe(nameOff + nameLen)
    expect(bcOff).toBe(jpegOff + jpegLen)
    expect(srcOff).toBe(bcOff + bcLen)
    // The whole blob is exactly header + every section.
    expect(blob.length).toBe(srcOff + srcLen)
    // The bytecode section round-trips byte-for-byte.
    expect(bcLen).toBe(byteCode.length)
    expect(blob.subarray(bcOff, bcOff + bcLen)).toEqual(byteCode)
  })

  it('emits an empty jpeg section when no preview image is supplied', () => {
    const blob = encodePbp({
      id: 'ABCDEFGHJKLMNPQRS',
      name: 'x',
      sourceCode: 'y',
      byteCode: fakeBytecode(),
    })
    const [, , , , jpegLen] = readHeader(blob)
    expect(jpegLen).toBe(0)
  })

  it('round-trips the name and source sections through decodePbp', () => {
    const source = 'export function render(index) {\n  hsv(time(.1), 1, 1)\n}'
    const blob = encodePbp({
      id: 'ABCDEFGHJKLMNPQRS',
      name: 'Rainbow Sweep',
      sourceCode: source,
      byteCode: fakeBytecode(),
    })
    const decoded = decodePbp(blob)
    expect(decoded).not.toBeNull()
    expect(decoded!.version).toBe(PBP_VERSION)
    expect(decoded!.name).toBe('Rainbow Sweep')
    expect(decoded!.sourceCode).toBe(source)
    expect(decoded!.byteCode).toEqual(fakeBytecode())
  })

  it('preserves a unicode name', () => {
    const blob = encodePbp({
      id: 'ABCDEFGHJKLMNPQRS',
      name: 'Café ✨',
      sourceCode: 'z',
      byteCode: new Uint8Array(0),
    })
    expect(decodePbp(blob)!.name).toBe('Café ✨')
  })
})

describe('encodePbpSourceSection / decodePbpSource', () => {
  it('wraps source in the {"main":…} JSON container before compressing', () => {
    const section = encodePbpSourceSection('export function render(i){}')
    expect(decodePbpSource(section)).toBe('export function render(i){}')
  })

  it('decodes an empty section to an empty string', () => {
    expect(decodePbpSource(new Uint8Array(0))).toBe('')
  })
})

describe('decodePbp', () => {
  it('returns null for a buffer too short to hold the header', () => {
    expect(decodePbp(new Uint8Array(10))).toBeNull()
  })

  it('returns null when a section bound falls outside the blob', () => {
    const blob = encodePbp({
      id: 'ABCDEFGHJKLMNPQRS',
      name: 'x',
      sourceCode: 'y',
      byteCode: fakeBytecode(),
    })
    // Corrupt the source length to overflow the buffer.
    new DataView(blob.buffer).setUint32(8 * 4, 0xffff, true)
    expect(decodePbp(blob)).toBeNull()
  })
})
