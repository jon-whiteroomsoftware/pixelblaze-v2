# Native built-in cost table — Pixelblaze hardware

**Generated:** 2026-06-07  
**Device:** `192.168.8.224`  
**Firmware:** 3.67  
**Inner-loop count (iters):** 6476  
**Baseline frame (identity loop):** 41.068 ms  
**Normalization unit:** one multiply = 0.703 µs (≡ 1.0×)

Produced by `npm run profile` (test/perf-harness). The profiler pattern is hand-loaded via the ElectroMage editor; the runner drives it over the documented getVars/setVars API. Costs are **relative to a multiply** and measured in `beforeRender` (isolated from the per-pixel LED-output path), so they answer "is `wave` cheaper than `sin`, and by how much" — the one question the float64 emulator cannot answer.

| built-in | group | net µs/call | relative to mul |
|---|---|---|---|
| `mul` | arithmetic | 0.703 | 1.0× |
| `add` | arithmetic | 0.784 | 1.1× |
| `sub` | arithmetic | 0.834 | 1.2× |
| `div` | arithmetic | 1.349 | 1.9× |
| `mod (%)` | arithmetic | 0.913 | 1.3× |
| `abs` | rounding | 1.265 | 1.8× |
| `floor` | rounding | 1.376 | 2.0× |
| `ceil` | rounding | 1.402 | 2.0× |
| `frac` | rounding | 1.380 | 2.0× |
| `sin` | trig | 2.047 | 2.9× |
| `cos` | trig | 2.256 | 3.2× |
| `tan` | trig | 3.438 | 4.9× |
| `wave` | waveform | 2.059 | 2.9× |
| `triangle` | waveform | 1.105 | 1.6× |
| `square` | waveform | 1.165 | 1.7× |
| `sqrt` | transcendental | 2.499 | 3.6× |
| `pow` | transcendental | 6.075 | 8.6× |
| `exp` | transcendental | 8.839 | 12.6× |
| `log` | transcendental | 2.885 | 4.1× |
| `hypot` | transcendental | 2.534 | 3.6× |
| `atan2` | inverse-trig | 1.951 | 2.8× |
| `atan` | inverse-trig | 1.693 | 2.4× |
| `asin` | inverse-trig | 3.350 | 4.8× |
| `acos` | inverse-trig | 3.896 | 5.5× |
| `clamp` | utility | 1.519 | 2.2× |
| `min` | utility | 0.926 | 1.3× |
| `max` | utility | 0.825 | 1.2× |
| `perlin` | noise | 4.027 | 5.7× |
| `perlinTurbulence` | noise | 2.943 | 4.2× |
| `perlinRidge` | noise | 5.450 | 7.8× |

## Method & caveats

- **Net cost** = `ms(op) − ms(baseline)`, divided by `iters`. Dispatch is hoisted out of the inner loop (one tight per-op loop, selected once per frame), so the baseline is the identical loop + `frac` wrap with an identity op and loop/frame overhead cancels exactly.
- **Relative** numbers (×multiply) are robust to per-frame fixed cost and to the exact `iters`/firmware FPS target; prefer them over absolute µs.
- Operands are wrapped to `[0,1)` each iteration, so 16.16 overflow does not change costs frame to frame. Ops with limited domains (`sqrt`, `log`, `asin`, `acos`) get a small offset/clamp — see profiler.js.
- A near-zero or negative net (within noise) means the op is indistinguishable from a multiply on this firmware.
- `wave` measures ~`sin`, not a cheap table lookup: on this firmware `wave()` *is* a sinusoid. The genuinely cheap periodics are `triangle`/`square`.
- Each op is profiled with one fixed argument set (see `op` in profiler.js); cost can vary with operands. Notably `perlinTurbulence` here measures below `perlin` — likely an artifact of the octave/lacunarity args, not a true per-call ordering. Treat the noise family as indicative, not exact.
