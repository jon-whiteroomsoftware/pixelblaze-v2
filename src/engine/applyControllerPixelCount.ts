import type { ControllerProvider } from './ControllerProvider'

/** Set the device pixel count so that reducing it actually darkens the physical
 *  LEDs beyond the new count, matching the canonical Pixelblaze editor (issue #222).
 *
 *  Sending `{pixelCount, save:true}` alone leaves the LEDs beyond the new count lit
 *  in their last-rendered colour (WS2812s hold their last value until re-clocked).
 *  The reference client's `setPixelCount` defaults to `save:false`
 *  (https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2083);
 *  that *live* (non-saved) apply is what re-initialises the LED driver and clocks a
 *  fresh full-length frame, darkening the tail. So we issue the live apply FIRST,
 *  then persist with `save:true` so the count still survives a reboot.
 *
 *  Then, when this is a genuine reduction and the device carries a custom map larger
 *  than the new count, truncate it to match (the reference notes the Pixelblaze UI
 *  "re-evaluates the map function and resends the map data" on a count change; we
 *  lack the source, so we slice the read-back coords — they round-trip losslessly
 *  through decode/encodeMapData). No-op when the count is unchanged or raised, when
 *  `prevCount` is unknown, or when the device has no map / a small-enough map.
 *  Returns the map's new point count when it was truncated, else null. */
export async function applyControllerPixelCount(
  provider: ControllerProvider,
  newCount: number,
  prevCount: number | null,
): Promise<number | null> {
  await provider.setPixelCount(newCount, false)
  await provider.setPixelCount(newCount, true)
  if (prevCount == null || newCount >= prevCount) return null
  const map = await provider.getPixelMap().catch(() => null)
  if (!map || map.length <= newCount) return null
  await provider.setPixelMap(map.slice(0, newCount))
  return newCount
}
