# Handoff — Issue #222: reducing the Controller pixel count doesn't darken the LEDs beyond the new limit

**Status: RESOLVED on hardware (2026-06-04).** The fix is the blackout-then-shrink maneuver in `applyControllerPixelCount.ts` — verified live on the user's device. The history below is kept for the record; the resolution is in the next section.

## Resolution (verified on hardware 2026-06-04)

We captured the canonical Pixelblaze UI's behavior directly (WebSocket hook on the device's own web page) and observed, on the physical strip:

1. **The canonical UI does NOT clear the tail on a count reduction.** The original assumption behind #222 was false — reducing the count in the gold-standard editor leaves LEDs beyond the new count frozen at their last colour, exactly like ours did.
2. **Pushing a smaller map does NOT clear the tail either** (tested directly). So the map-truncation approach in the old code never did the job it was added for. (Both `pixelCount` and map writes from the device UI go over **HTTP**, not WebSocket — only `ping`/`sendUpdates` cross the WS.)
3. **There is no per-pixel wire command.** You cannot walk the strip and disable pixels individually.

**The working fix** (the only mechanism that darkens the tail, since WS2812s hold their last value until re-clocked and the device only clocks `pixelCount` LEDs): clock the whole strip black *while the count is still high*, then shrink.

```
reduce(oldCount -> newCount):
  setBrightness(0, save:false)     // drive every old-length LED black
  wait ~400ms                      // let the device render >=1 full-length black frame
  setPixelCount(newCount, save:true)
  setBrightness(restore, save:false)  // first newCount resume the pattern; tail frozen black
```

Brightness is read from `getConfig()`; if it can't be read we skip the blackout (zeroing a brightness we can't restore would strand the strip dark) and fall back to a plain count write. Only runs on a genuine reduction. Lives in `src/engine/applyControllerPixelCount.ts` (returns `void` now — the old map-truncation and its return value are gone). Verified live: the tail goes dark and stays dark, first N LEDs resume the pattern. Full suite green (1288), `tsc` clean.

---

## Original investigation (superseded; kept for the record)

## The problem

On a connected Pixelblaze Controller, reducing the pixel count (e.g. 256 → 4) should turn **off** every physical LED beyond the new count — that is what the canonical Pixelblaze editor does. In our IDE the pattern correctly shrinks to the first N pixels, but LEDs N..oldCount-1 **stay frozen at their last-rendered color** (classic WS2812 "hold last value until re-clocked" behavior).

The bug is about the **physical device**, not the IDE preview. The preview is deliberately walled off from the Controller — nothing in the IDE preview ever writes to the device, and that boundary must stay. (Confirmed by the user: "nothing you ever change on the IDE preview ever changes anything on the controller, nor should it.")

## Hard-won facts (don't re-litigate these)

1. **`{pixelCount: N, save: true}` alone does NOT clear the tail** on the user's firmware. Verified on hardware: the pattern shrank to 4 px, LEDs 4..255 stayed lit. So the plain count write is not the clearing mechanism.

2. **There is no direct "set pixels / clear pixels" wire command.** The only client→device messages that can affect pixels are (from the reference client `messageTypes`): `putSourceCode=1`, `putByteCode=3`, `putPixelMap=8`, plus JSON config frames (`pixelCount`, `brightness`, `setVars`, `setControls`, `activeProgramId`, ...). So whatever clears the tail must be a **side effect** of one of: the `pixelCount` write, a `putPixelMap`, or a program (re)load. `previewFrame=5` is device→client only (read-back), not a way to push pixels.

3. **The reference is `zranger1/pixelblaze-client`** (Python), `pixelblaze/pixelblaze.py`. Key findings:
   - `setPixelCount(nPixels, *, saveToFlash=False)` (≈ line 2083) just sends `{pixelCount, save}`. It defaults `saveToFlash=**False**` — note our IDE was sending `save:true`.
   - It carries a telling TBD comment: *"The Pixelblaze UI also re-evaluates the map function and resends the map data...Should we do the same?"* — the client itself does **not** do this. This is the only documented hint about what the canonical UI does extra on a count change.
   - `getMapCoordinates` (≈ line 1695): when the device has **no** map, it synthesizes a default 1D linear map `[pixel/(pixelCount-1) for pixel in range(pixelCount)]`. So "the map function" is never truly absent — absent = default linear ramp.
   - `setMapData` (≈ line 1683) sends `putPixelMap` then `{savePixelMap:true}`. `createMapData` (≈ line 1641) — note it **re-normalizes per-axis (Fill)**, which our `encodeMapData` deliberately does NOT (see `src/engine/mapPush.ts` header comment); not relevant to clearing but don't get confused by it.

4. **Truncating/resending a map only clocks N LEDs too** — so by the same logic as fact #1 it may not clear LEDs beyond N either, UNLESS the firmware zeroes/reallocates the full physical output buffer on a `putPixelMap`. This is the **central open question** (see below). In the user's hardware test there was **no custom map installed**, so the map-resend path never actually ran — it remains untested on hardware.

## What's in the code right now (current approach — UNVERIFIED on hardware)

Single engine helper `src/engine/applyControllerPixelCount.ts`, called from the two flows that set the device count **without** pushing a fresh map:
- `src/store/controllerPanelStore.ts` → `setPixelCount` (Controller panel direct edit)
- `src/store/controllerStore.ts` → `confirmSetPixelCountOnly` (map-push dialog's "set pixel count only" remedy)

The helper now does:
```ts
await provider.setPixelCount(newCount, false)  // LIVE apply — hypothesised to clear the tail
await provider.setPixelCount(newCount, true)   // persist so the count survives reboot
// then, only on a genuine reduction with a custom map larger than newCount:
const map = await provider.getPixelMap().catch(() => null)
if (map && map.length > newCount) { await provider.setPixelMap(map.slice(0, newCount)); return newCount }
```
**Current hypothesis being tested:** the firmware re-initializes the LED driver (and clocks a fresh full-length frame) on a *live* `save:false` count change, but a `save:true`-only write just persists the config number. Hence live-apply-first, then persist. **This is a guess** grounded only in the reference's `save=False` default — the user has NOT yet re-tested on hardware.

Map truncation round-trips losslessly: `decodeMapData` is the exact inverse of `encodeMapData` (`src/engine/mapPush.ts`). Truncation is geometrically correct for a reduction of an index-aligned map and the user explicitly endorsed truncating (vs re-baking the IDE's own map, which could overwrite the device map with a different one).

### Flows that set the device count (full inventory — already mapped)
| Flow | Location | Pushes fresh map? | Gets the helper? |
|---|---|---|---|
| Panel direct edit | `controllerPanelStore.setPixelCount` | No | **Yes** |
| "Set pixel count only" remedy | `controllerStore.confirmSetPixelCountOnly` | No | **Yes** |
| Blocked map push (coupled) | `controllerStore.confirmMapPush` | Yes | No (new map defines points) |
| Map push only | `controllerStore.confirmMapPushOnly` | Yes | No |
| Pattern push | `controllerStore.pushActivePattern` | Never sets count | No |

Tests: `src/engine/applyControllerPixelCount.test.ts` (new) + additions in the two store test files. Full suite green (1288), `tsc --noEmit` clean. **Green tests prove the wire calls we make, NOT that the device clears** — the only real test is hardware.

## Next steps for whoever picks this up

**First: re-test the current code on hardware** (256 px lit → reduce to 4 → do LEDs 4..255 go dark?). If yes, ship it. If no, the `save:false` live-apply hypothesis is wrong; move on.

**If the live-apply doesn't clear**, the prime remaining suspect is a `putPixelMap` buffer re-init. Try: on a reduction, **always** send a map at the new count — when the device has no custom map, synthesize the default 1D linear map `[[0],[1/(N-1)],...,[1]]` (arity-1 coords, matches the reference's default) and `setPixelMap` it. This is the literal "re-evaluate the map function and resend" the reference comment describes. Caveat: this imposes a map on a device that had none — confirm with the user that's acceptable (it likely matches what the canonical Settings page does, but unverified).

**Useful experiments to disambiguate the firmware** (needs hardware + maybe a WS sniff):
- Does `activeProgramId` re-send (program reload) clear the tail? Programs likely zero the buffer on load.
- Watch what the **device's own web UI** sends when you change LED count in its Settings page — open the device IP, devtools → WS frames, change the count, capture the exact frame sequence. That is the definitive ground truth and sidesteps all guessing. (The reference client is a faithful-but-incomplete proxy for the real UI; the TBD comment proves it doesn't replicate everything.)
- Test whether `save:false` vs `save:true` actually differ for clearing, in isolation.

**Key open question:** does the Pixelblaze firmware always clock the full *physical* strip length (so the tail is whatever's left in the buffer, and the fix is to get the firmware to zero that buffer), or does it only clock `pixelCount` LEDs (so the tail can only be cleared by momentarily driving the *old* length with black)? If the latter, no client-side message sequence can clear it after the count is already reduced — you'd have to write a black full-length frame *before* shrinking, which the wire protocol may not even support (no direct pixel-write command exists). Resolve this question before writing more code.

## Files touched (uncommitted → committed in this handoff's commit)
- `src/engine/applyControllerPixelCount.ts` (new) + `.test.ts` (new)
- `src/store/controllerPanelStore.ts` (+ test)
- `src/store/controllerStore.ts` (+ test)

## References
- Reference client: https://github.com/zranger1/pixelblaze-client/blob/main/pixelblaze/pixelblaze.py (`setPixelCount` ~L2083, `setMapFunction`/`setMapData` ~L1622/1683, `getMapCoordinates` ~L1695, `messageTypes` ~L460)
- In-repo: `docs/ElectroMage/Pixelblaze Websockets Api.md` (no `pixelCount`/clear semantics documented), `src/engine/mapPush.ts` (encode/decode + the Fill-divergence note), `docs/PXLBLZ Technical Reference.md` §13, ADR-0004 (pixelCount independent of map).
- Related issues: #213 (count↔map coupling on map push), #204/#205 (map push + read-back).
