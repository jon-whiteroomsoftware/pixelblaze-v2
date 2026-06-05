// Pure encoder for the Pixelblaze Binary Pattern (PBP) blob — the payload the
// firmware stores as a saved pattern (`/p/{id}`) so it appears in the ElectroMage
// Saved Patterns list (#236). This is distinct from a run-only bytecode push
// (`pushByteCode`): that loads + runs a pattern but never persists a record, so a
// pushed pattern runs yet never shows up in the list and its id resolves to no name.
//
// FORMAT REFERENCE — mirrors `PBP.fromComponents` / `PBP.toPixelblaze` in the
// reference client zranger1/pixelblaze-client (pixelblaze/pixelblaze.py, commit
// 9be8470):
//   https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2992
// The blob is a 36-byte header of nine little-endian uint32s —
//   [0] version ( = 2 for v3 firmware )
//   [1] nameOffset      [2] nameLength
//   [3] jpegOffset      [4] jpegLength
//   [5] bytecodeOffset  [6] bytecodeLength
//   [7] sourceOffset    [8] sourceLength
// — followed by the four sections concatenated in that order (name, jpeg, bytecode,
// source). Offsets are absolute from the start of the blob, so the first section
// (name) begins at 36. The preview JPEG is optional; we send an empty section.
//
// The source section is NOT raw text: the firmware requires it wrapped in a JSON
// container `{"main":"<source>"}` (to identify the source file), then LZString-
// compressed to a Uint8Array — the same `compressToUint8Array` the browser editor
// uses, so the round-trip matches the device exactly.

import LZString from 'lz-string'

/** The four components of a saved pattern. `id` is the firmware's 17-char program
 *  id (mint via `makeProgramId`); `byteCode` is the device-compiler output;
 *  `previewImage` is an optional JPEG preview (empty section when omitted). */
export interface PbpComponents {
  id: string
  name: string
  sourceCode: string
  byteCode: Uint8Array
  previewImage?: Uint8Array
}

/** The fixed header size — nine LE uint32s. The first section starts here. */
export const PBP_HEADER_SIZE = 36
/** The version field for v3 firmware (the only firmware our adapters target). */
export const PBP_VERSION = 2

/** Encode the pattern's source into the firmware's stored section: wrap in the
 *  `{"main":…}` JSON container, then LZString-compress to bytes. Exposed for the
 *  round-trip test and symmetry with `decodePbpSource`. */
export function encodePbpSourceSection(sourceCode: string): Uint8Array {
  const payload = JSON.stringify({ main: sourceCode })
  return LZString.compressToUint8Array(payload)
}

/** Encode the four components into the PBP binary blob (header + sections). The
 *  returned bytes are the blob alone — the `putSourceCode` framing prepends the id
 *  (see `PixelblazeConnection.saveProgram`). */
export function encodePbp(c: PbpComponents): Uint8Array {
  const nameBytes = new TextEncoder().encode(c.name)
  const jpegBytes = c.previewImage ?? new Uint8Array(0)
  const bytecodeBytes = c.byteCode
  const sourceBytes = encodePbpSourceSection(c.sourceCode)

  const nameOffset = PBP_HEADER_SIZE
  const jpegOffset = nameOffset + nameBytes.length
  const bytecodeOffset = jpegOffset + jpegBytes.length
  const sourceOffset = bytecodeOffset + bytecodeBytes.length
  const total = sourceOffset + sourceBytes.length

  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  const header = [
    PBP_VERSION,
    nameOffset,
    nameBytes.length,
    jpegOffset,
    jpegBytes.length,
    bytecodeOffset,
    bytecodeBytes.length,
    sourceOffset,
    sourceBytes.length,
  ]
  header.forEach((v, i) => dv.setUint32(i * 4, v, true))

  out.set(nameBytes, nameOffset)
  out.set(jpegBytes, jpegOffset)
  out.set(bytecodeBytes, bytecodeOffset)
  out.set(sourceBytes, sourceOffset)
  return out
}

/** The decoded sections of a PBP blob — the inverse of `encodePbp`, used by the
 *  round-trip test and any read-back path. */
export interface DecodedPbp {
  version: number
  name: string
  jpeg: Uint8Array
  byteCode: Uint8Array
  /** The raw pattern source, un-wrapped from its `{"main":…}` JSON container. */
  sourceCode: string
}

/** Un-wrap the source section back to raw text: LZString-decompress, then read the
 *  `main` field of the JSON container. Returns '' for an empty/garbage section. */
export function decodePbpSource(section: Uint8Array): string {
  if (section.length === 0) return ''
  const payload = LZString.decompressFromUint8Array(section)
  if (!payload) return ''
  try {
    const parsed = JSON.parse(payload) as { main?: unknown }
    return typeof parsed.main === 'string' ? parsed.main : ''
  } catch {
    return ''
  }
}

/** Decode a PBP blob into its sections. Returns null for a buffer too short to hold
 *  the header or whose section bounds fall outside the blob. */
export function decodePbp(bytes: Uint8Array): DecodedPbp | null {
  if (bytes.length < PBP_HEADER_SIZE) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const f = (i: number) => dv.getUint32(i * 4, true)
  const version = f(0)
  const slice = (offIdx: number, lenIdx: number): Uint8Array | null => {
    const off = f(offIdx)
    const len = f(lenIdx)
    if (off + len > bytes.length) return null
    return bytes.subarray(off, off + len)
  }
  const nameSec = slice(1, 2)
  const jpegSec = slice(3, 4)
  const bcSec = slice(5, 6)
  const srcSec = slice(7, 8)
  if (!nameSec || !jpegSec || !bcSec || !srcSec) return null
  return {
    version,
    name: new TextDecoder().decode(nameSec),
    jpeg: jpegSec,
    byteCode: bcSec,
    sourceCode: decodePbpSource(srcSec),
  }
}
