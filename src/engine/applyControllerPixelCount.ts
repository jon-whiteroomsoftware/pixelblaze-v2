import type { ControllerProvider } from './ControllerProvider'

/** How long to hold the strip black before shrinking, so the firmware clocks at
 *  least one full-length all-black frame across the *old* pixel count. Verified on
 *  hardware: a few device frames is ample even at low FPS. */
const DARK_FRAME_MS = 400

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Set the device pixel count so that reducing it actually darkens the physical
 *  LEDs beyond the new count (issue #222).
 *
 *  WS2812s hold their last value until re-clocked, and the device only clocks
 *  `pixelCount` LEDs — so after a reduction the tail LEDs are never clocked again
 *  and freeze on their last colour. Verified on hardware (2026-06-04): the
 *  canonical Pixelblaze UI does NOT clear them either — neither a `pixelCount`
 *  write nor a `putPixelMap` clears the tail, and there is no per-pixel wire
 *  command. The only way to darken them is to clock them black *while the count is
 *  still high*, then shrink. We do that by momentarily zeroing global brightness:
 *
 *    setBrightness(0) → wait one dark frame → setPixelCount(newCount) → restore
 *
 *  The whole old-length strip is driven black, then we stop clocking the tail, so
 *  it freezes at black; the first `newCount` LEDs resume the pattern at the
 *  restored brightness. The only cost is a brief full-strip blackout flash, which
 *  is acceptable for a deliberate count change.
 *
 *  Only runs on a genuine reduction with a *readable* brightness — if we cannot
 *  read the current brightness we skip the blackout (zeroing a brightness we can't
 *  restore would strand the strip dark) and fall back to a plain count write.
 *  Raising the count, an unchanged count, or an unknown `prevCount` likewise just
 *  write the count. `sleep` is injectable so tests need not wait the dark frame. */
export async function applyControllerPixelCount(
  provider: ControllerProvider,
  newCount: number,
  prevCount: number | null,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<void> {
  const reducing = prevCount != null && newCount < prevCount
  if (reducing) {
    const config = await provider.getConfig().catch(() => null)
    const restore = config?.brightness
    if (restore != null) {
      await provider.setBrightness(0, false)
      await sleep(DARK_FRAME_MS)
      await provider.setPixelCount(newCount, true)
      await provider.setBrightness(restore, false)
      return
    }
  }
  await provider.setPixelCount(newCount, true)
}
