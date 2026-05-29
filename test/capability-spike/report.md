# Capability report — Pixelblaze WebSocket protocol

**Generated:** 2026-05-29  
**Device:** `192.168.8.224`  
**Firmware:** 3.67  

Produced by `npm run spike` (test/capability-spike). Exercises the extended `PixelblazeConnection` against a real device to establish empirically what the protocol supports — the Phase-2 gate for the Hardware Connectivity UI arc (#108). This file is auto-generated raw evidence; hand-written interpretation and the gate recommendation live in [`findings.md`](./findings.md).

## Summary

| capability | verdict | note |
|---|---|---|
| `listPrograms (binary decode)` | ✅ works | decoded 8 program(s) from the type-7 binary frames |
| `activeProgramId round-trip` | ✅ works | set and confirmed the active program switched (read via getConfig) |
| `getControls / setControls` | ✅ works | slider set without save, confirmed via live getConfig.activeControls; stored value unchanged (volatile). getControls(id) returns stored controls nested under the program id; live values come from getConfig |
| `brightness` | ✅ works | brightness set and confirmed via getConfig (volatile — not saved) |
| `pattern push (putSourceCode, source only)` | 🟡 partial | putSourceCode (source only, NO bytecode) sent. The device runs bytecode compiled by the ElectroMage editor in-browser; the IDE does not produce bytecode, so source-only push is not expected to create a runnable pattern. program count before=8, after=8 (unchanged). |

## Evidence

### listPrograms (binary decode)

**Verdict:** ✅ works  
**Note:** decoded 8 program(s) from the type-7 binary frames

```
9WZFPZMYQYsjarJaG	RGB Test Pattern
Jjo5zznvab7nHp73B	IDE-hardware-test
HnaCkpb38ei3Pwigt	matrix 2D honeycomb
jw4w2bxZSg9K9KTXh	Perlin fire
hbo4FgbLfvG7Pm6Yi	Perlin/Simplex Noise 2D
b2LCPZ29Laudmg9JR	rainbow melt
vqDGYatxg9yJd5qpn	regenbogendrogen
AQaQwXT55rwGZERhG	Shimmer Crossfade 2D
```

### activeProgramId round-trip

**Verdict:** ✅ works  
**Note:** set and confirmed the active program switched (read via getConfig)

```
active before: 9WZFPZMYQYsjarJaG
set active → Jjo5zznvab7nHp73B (IDE-hardware-test)
active after: Jjo5zznvab7nHp73B
```

### getControls / setControls

**Verdict:** ✅ works  
**Note:** slider set without save, confirmed via live getConfig.activeControls; stored value unchanged (volatile). getControls(id) returns stored controls nested under the program id; live values come from getConfig

```
RGB Test Pattern: 0 slider(s) 
IDE-hardware-test: 0 slider(s) 
matrix 2D honeycomb: 0 slider(s) 
Perlin fire: 4 slider(s) {"sliderMode":0.695,"sliderScale":0.54,"sliderRisingSpeed":0.29,"sliderMorphSpeed":0.27}
Perlin/Simplex Noise 2D: 12 slider(s) {"sliderPerlinOrSimplex":1.963374,"sliderScale":0.33,"sliderMotion":0.045,"sliderAutoColor":0.7,"sliderAutoColorPalette":0.535,"sliderNumberOfStripes":0.4,"sliderStripeSpeed":0.05,"sliderStripeWeight":0,"sliderX_Offset":3.557897e-41,"sliderY_Offset":0.695,"sliderShowProgress":1.984691,"sliderBassThreshold":15764510000000}
rainbow melt: 0 slider(s) 
regenbogendrogen: 0 slider(s) 
Shimmer Crossfade 2D: 0 slider(s) 
— round-trip on jw4w2bxZSg9K9KTXh, slider "sliderMode"
set sliderMode=0.25 (no save); live read back: 0.25
stored (flash) value still: 0.695
```

### brightness

**Verdict:** ✅ works  
**Note:** brightness set and confirmed via getConfig (volatile — not saved)

```
brightness before: 0.2
set brightness=0.8 (no save)
brightness after: 0.8
```

### pattern push (putSourceCode, source only)

**Verdict:** 🟡 partial  
**Note:** putSourceCode (source only, NO bytecode) sent. The device runs bytecode compiled by the ElectroMage editor in-browser; the IDE does not produce bytecode, so source-only push is not expected to create a runnable pattern. program count before=8, after=8 (unchanged).

```
pushed source:
// __spike_probe_1780075644793
export function render(index) {
  hsv(0, 1, 1)
}

programs after push: RGB Test Pattern, IDE-hardware-test, matrix 2D honeycomb, Perlin fire, Perlin/Simplex Noise 2D, rainbow melt, regenbogendrogen, Shimmer Crossfade 2D
See findings.md for the bytecode-compiler investigation and gate recommendation.
```
