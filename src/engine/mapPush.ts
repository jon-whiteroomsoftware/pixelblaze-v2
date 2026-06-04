// Pure encoder for the Pixelblaze binary "mapData" blob — the payload of a type-8
// putPixelMap message (H12, issue #204). Transport-agnostic and React-free: it turns
// a baked coordinate array into the exact byte layout the firmware stores as the
// device's single shared pixel map.
//
// FORMAT REFERENCE — mirrors `createMapData` / `setMapData` in the reference client
// zranger1/pixelblaze-client (pixelblaze/pixelblaze.py, commit 9be8470):
//   https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L1641
// The blob is a 12-byte header of three little-endian uint32s —
//   [0] formatVersion  ( = firmware major - 1; v3 → 2, v2 → 1 )
//   [1] numDimensions  ( 1 / 2 / 3 )
//   [2] numPixels * numDimensions * formatVersion  ( = the body byte count )
// — followed by every coordinate as a `formatVersion`-byte little-endian unsigned
// int, scaled into 0..maxInt where maxInt = 2^(8*formatVersion) - 1.
//
// DELIBERATE DIVERGENCE from the reference: `createMapData` re-normalizes raw author
// coordinates per-axis to fill 0..maxInt (a Fill pass). We do NOT — our `points` are
// already firmware-normalized to [0,1] by the preview layout (Contain or Fill, the
// user's per-map choice, ADR-0009/#174). Re-stretching here would silently force Fill
// and break aspect, so we scale [0,1] straight through and only clamp. What the
// preview shows is exactly what the device receives.

import { bakeMapSource } from './maps'

/** A baked coordinate per pixel: `[x,y]` (2D), `[x,y,z]` (3D), or `[x]` (1D). Values
 *  are expected pre-normalized to [0,1] per axis; out-of-range values are clamped. */
export type MapCoord = number[]

/** Resolve the coordinate array to actually push to a Controller (#204 hardware fix).
 *
 *  The firmware stores exactly `pixelCount` map entries — a blob of any other size is
 *  dropped wholesale, so the map silently never takes effect. Our preview-baked points
 *  are baked at the *preview* pixel count (`activePixelCount`, default 4096), which has
 *  no relation to the device's wired pixel count, so they routinely mismatch.
 *
 *  When we know the device count and have the map's source, re-evaluate the map at that
 *  count — mirroring the reference client's `setMapFunction`, which calls the map
 *  function with `getPixelCount()` before encoding:
 *    https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L1635
 *  Fall back to the preview-baked points when the source or device count is missing, the
 *  re-bake throws, or it yields nothing — a same-size mismatch is still better than none. */
export function resolveMapPushPoints(
  source: string | undefined,
  fallbackPoints: MapCoord[],
  devicePixelCount: number | null,
): MapCoord[] {
  if (source && devicePixelCount != null && devicePixelCount > 0) {
    try {
      const baked = bakeMapSource(source, devicePixelCount)
      if (baked.points.length > 0) return baked.points
    } catch {
      // Source no longer evaluates — fall through to the last good baked points.
    }
  }
  return fallbackPoints
}

export interface EncodeMapDataOptions {
  /** Bytes per coordinate AND the version tag, per the reference: firmware major - 1.
   *  Defaults to 2 (v3 firmware — the only firmware our adapters target). */
  formatVersion?: number
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Encode a baked coordinate array into the firmware's binary mapData blob. Throws on
 *  an empty array, mixed arity, or an arity outside 1..3. */
export function encodeMapData(
  points: MapCoord[],
  { formatVersion = 2 }: EncodeMapDataOptions = {},
): Uint8Array {
  if (points.length === 0) {
    throw new Error('encodeMapData: at least one coordinate is required')
  }
  const numDimensions = points[0].length
  if (numDimensions < 1 || numDimensions > 3) {
    throw new Error(`encodeMapData: coordinate arity must be 1, 2, or 3 (got ${numDimensions})`)
  }
  for (const p of points) {
    if (p.length !== numDimensions) {
      throw new Error(
        `encodeMapData: mixed coordinate arity (expected ${numDimensions}, got ${p.length})`,
      )
    }
  }

  const numPixels = points.length
  const maxInt = 2 ** (8 * formatVersion) - 1
  const bodyBytes = numPixels * numDimensions * formatVersion
  const out = new Uint8Array(12 + bodyBytes)
  const view = new DataView(out.buffer)

  view.setUint32(0, formatVersion, true)
  view.setUint32(4, numDimensions, true)
  view.setUint32(8, bodyBytes, true)

  let off = 12
  for (const p of points) {
    for (let d = 0; d < numDimensions; d++) {
      const value = Math.round(clamp01(p[d]) * maxInt)
      // Little-endian, formatVersion bytes wide.
      let v = value
      for (let b = 0; b < formatVersion; b++) {
        out[off++] = v & 0xff
        v >>= 8
      }
    }
  }

  return out
}
