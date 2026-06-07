# Optimizing Pixelblaze patterns

A living guide to making patterns fast on Pixelblaze's **serial, fixed-point**
hardware. **Part I** is general — it applies to any pattern. **Part II** is
specific to GLSL / ShaderToy ports, which are the patterns that most often blow
the budget.

This guide replaces received wisdom with **measured numbers for our firmware**
wherever we have them. Where we only have folklore, it is labelled as such. Every
optimization is tagged with where it can be *proven*:

- **[bench-verifiable]** — the emulator benchmark can confirm it, because it
  reduces operation or call *count*.
- **[hardware-wisdom]** — only the device (or the [cost table](#the-measured-cost-table))
  can confirm it, because it trades one built-in for another of different
  hardware cost. The emulator runs every built-in as a native `Math.*` call, so
  it is blind to these.

---

## What this actually buys — the measured scoreboard

Every demo we ship, optimized and measured on real hardware (fw 3.67, 16×16
panel, `npm run devbench` before/after). **Almost all of it is one move** —
factoring per-pixel-invariant work into `beforeRender` (§4) — and almost all of
it is **bit-identical** (the preview checksum held in both renderer modes, so the
image is provably unchanged). The spread is the whole story: the *same* move
buys **+49.7%** on one demo and **~0%** on another.

| demo | what moved off the per-pixel path | FPS before→after | Δ | preserving |
|---|---|---|---|---|
| ControlsShowcase | 4 `cos`/`sin` + orbit geometry + edge falloff | 33.7 → 50.4 | **+49.7%** | ✅ both |
| NeonSquircles | ~100 trig/pixel → 20-ring `beforeRender` tables | 2.46 → 3.08 | +25.3% | ✅ both |
| TestPattern2D | 2 trig (dot centre) + breathe level | 101.9 → 124.5\* | +22.1% | ✅ both |
| GlowingOrb | `wave(t)` orb radius | 100.4 → 115.0 | +14.5% | ✅ both |
| KaleidoBloom | cell size + 5 derived radii + rainbow spread | 31.5 → 35.5 | +12.6% | ✅ both |
| Kishimisu | slider remaps + per-pixel `exp` memoization | 8.7 → 9.43 | ~+8.4% | ✅ both |
| ZippyZaps | 1 `pow` + 7 `cos`/iteration → index tables | 0.83 → 0.89 | +7.4% | ✅ both |
| AuroraSphere | frame-global great-ring normal + `hypot3` | 9.81 → 10.50 | +7.0% | Fast only |
| PlasmaNebula | scale / warp / twinkle-threshold scalars | 21.6 → 22.8 | +5.5% | ✅ both |
| NebulaSphere | scale / warp / threshold (3D) | 15.8 → 16.4 | +4.0% | ✅ both |
| PulseLoom | gaussian denominator (×4 voices) | 19.9 → 20.7 | +4.0% | ✅ both |
| IQPalettes | palette scroll offset | 35.1 → 35.9 | +2.5% | ✅ both |
| ShaderShowcase | zoom mult + twist coeff + half-time | 15.9 → 16.2 | +2.3% | ✅ both |
| Caustics | 5 time-only `sin`/`cos` + slider scalars | 2.83 → 2.87 | +1.7% | ✅ both |
| EasedSweep | `wave`+ease sweep position | 124.5 → 124.5\* | ~0% | ✅ both |
| PhantomStar | per-step scalars + `ringT` (rotation hoist already shipped) | 0.24 → 0.24 | +0.1% | ✅ both |

\* *already at / hitting the firmware's ~124.5 FPS ceiling — the CPU work is still
removed (it helps at larger pixel counts), but a rate-capped frame can't show it.*

**Read the spread, not the average.** The payoff of a `beforeRender` hoist is
governed by **whole-frame dilution** (§1): it's worth the cost of the work you
move *as a fraction of the whole frame*. ControlsShowcase wins big because 4 trig
calls are most of a cheap SDF frame; the same hoist on PlasmaNebula (perlin-bound)
or ZippyZaps (12-transcendental iteration loop) is a rounding error against the
rest. **Cheap demos have the most to gain from this move; the heavy ports need a
quality knob (octaves, march steps) to move materially** — and those change the
image, so they live on the far side of the checksum.

---

# Part I — General pattern optimization

## 1. The architecture gap

A ShaderToy shader runs on a **GPU**: thousands of cores, each evaluating one
pixel in parallel, in hardware `float`. A Pixelblaze runs on a **single
microcontroller core**, evaluating pixels **one at a time**, in **16.16
fixed-point** arithmetic. Two consequences dominate everything below:

1. **Cost is serial.** Your frame cost is roughly

   ```
   beforeRender  +  pixels × (per-pixel work)
   ```

   On a 16×16 grid that per-pixel multiplier is 256; on 32×32 it is 1024. A loop
   inside `render` is multiplied by the pixel count — a 95-step raymarch on a
   32×32 grid is ~97,000 iterations per frame.

2. **The two render functions have wildly different leverage.**

   | function | runs | put here |
   |---|---|---|
   | `beforeRender(delta)` | **once per frame** | anything that is the same for every pixel — time accumulation, frame-global trig, palette setup |
   | `render(index)` / `render2D(index, x, y)` | **once per pixel** | only work that genuinely depends on the pixel's position |

   Moving one `sin()` from `render2D` to `beforeRender` on a 32×32 grid removes
   **1023** evaluations per frame. This is the single highest-leverage move in
   the toolbox.

> **Fixed-point, not float.** On hardware *everything* is 16.16 fixed-point —
> there is no "float mode" on the device. The preview's Fast (float64) renderer
> is a *dev-loop convenience* for iterating quickly; it does not reflect device
> cost. Always do final checks in the Precise renderer. See the Technical
> Reference §2/§5.

## 2. How to profile

Three tools, in increasing order of fidelity. Use the cheapest one that can
answer your question.

### a. Caveman profiling (on the device, no tools)

The original method, and still the fastest way to find a hot spot:

- Watch the **FPS counter** in the editor.
- **Comment out** a suspected-expensive block and see if FPS jumps. Bisect until
  you find the line that costs the most.
- Time sections with `delta` (ms since last frame) printed via a `export var`.

This measures the *real device*, so it is always truthful — it just can't tell
you *why* a built-in is expensive.

### b. The emulator benchmark (`npm run bench`, `test/perf-harness/`)

A CLI (issue #247) that bundles a demo and times N frames under both shims at a
given grid size, emitting a per-mode FNV-1a **pixel checksum** alongside the mean
frame time:

```bash
npm run bench -- Kishimisu                      # both modes, time + checksum
npm run bench -- Kishimisu --frames 120 --grid 64x32
```

The **checksum is the guard rail**: re-run after an edit and compare *per mode* —
identical checksum ⇒ byte-for-byte identical output, so any frame-time delta is a
pure speed change, and a drift tells you a change was *not* output-preserving.

- **What it's good for:** comparing two *versions* of a pattern (did my rewrite
  reduce work?), proving an edit was output-preserving (checksum), and seeing the
  Precise-renderer iteration tax in the dev loop.
- **What it cannot tell you:** the relative cost of individual built-ins. In the
  emulator **every** math built-in is a native `Math.*` call in *both* shims (the
  Precise path only quantizes the result), so it measures **operation/call
  count, not hardware per-function cost** — and even gets the ordering wrong
  (`wave()` is *slower* than `sin()` there; on hardware they are equal). This is
  the **[bench-verifiable]** / **[hardware-wisdom]** boundary.

### c. The hardware profiler (`test/perf-harness/`, issue #245)

A hand-loaded probe pattern driven over LAN that measures the **real per-built-in
cost on the device** and writes the [cost table](#the-measured-cost-table). This
is the only source of truth for "is `wave` cheaper than `sin`, and by how much."

```bash
PIXELBLAZE_IP=<ip> PIXELBLAZE_FW=<ver> npm run profile
```

See `test/perf-harness/README.md`. It's human-in-the-loop (needs a physical
device) and excluded from the pre-commit gate.

### d. The hardware FPS bench (`npm run devbench`, `test/perf-harness/`, issue #248)

The automated end of the loop, and the truest whole-frame number short of
watching the editor yourself. It bundles a demo (or any `.js` file), compiles it
with the device's own compiler **headless** (no Chrome extension — see the
harness README), pushes it run-only over the LAN, confirms the device actually
switched to it (`activeProgramId` guard), and samples the FPS the firmware
reports. Pass two sources for a before/after Δ:

```bash
PIXELBLAZE_IP=<ip> npm run devbench -- Kishimisu
PIXELBLAZE_IP=<ip> npm run devbench -- /tmp/Kishimisu.baseline.js Kishimisu
```

This is what turns a **[hardware-wisdom]** claim into a measured one: the cost
table predicts a per-pixel-body saving, but only the FPS bench tells you what
fraction of the *frame* that body was, and hence the real gain. Use it for the
final sign-off on any optimization whose payoff the emulator can't see. Like the
profiler, it needs a physical device and is out of the pre-commit gate.

## 3. The measured cost table

Measured on real hardware, **firmware 3.67**, relative to a single multiply
(`mul` ≡ 1.0×). Source of record: [`test/perf-harness/costs.md`](../../test/perf-harness/costs.md),
regenerated by `npm run profile`. Use the **relative** column — it is robust to
grid size and FPS target.

| built-in | group | ×mul | built-in | group | ×mul |
|---|---|---|---|---|---|
| `mul` | arithmetic | **1.0** | `wave` | waveform | 2.9 |
| `add` | arithmetic | 1.1 | `triangle` | waveform | **1.6** |
| `sub` | arithmetic | 1.2 | `square` | waveform | **1.6** |
| `max` | utility | 1.2 | `sqrt` | transcendental | 3.5 |
| `min` / `mod` | arithmetic | 1.3 | `log` | transcendental | 4.0 |
| `abs` | rounding | 1.8 | `pow` | transcendental | **8.5** |
| `div` / `floor` | arithmetic | 1.9 | `exp` | transcendental | **12.2** |
| `ceil` / `frac` | rounding | 2.0 | `hypot` | transcendental | 3.6 |
| `clamp` | utility | 2.1 | `atan` | inverse-trig | 2.4 |
| `sin` | trig | 2.9 | `atan2` | inverse-trig | 2.7 |
| `cos` | trig | 3.2 | `asin` | inverse-trig | 4.8 |
| `tan` | trig | 4.8 | `acos` | inverse-trig | 5.5 |
| `perlin` | noise | 5.8 | `perlinTurbulence` | noise | 4.1 |
| `perlinRidge` | noise | 7.6 | | | |

**What the numbers overturn:**

- **`wave` ≈ `sin` (both ~2.9×), *not* a cheap table lookup.** The folklore
  "prefer `wave()` over `sin()`/`cos()`" is **false on fw 3.67** — `wave()` *is*
  a sinusoid and costs the same. If you only need a cheap periodic shape (not
  specifically a sine), reach for **`triangle`/`square` (1.6×)** instead. Swap
  `sin`→`wave` only for clarity, never for speed.
- **The expensive scalars are `exp` (12.2×) and `pow` (8.5×).** A single `pow`
  in `render2D` costs more than eight multiplies *per pixel*. `exp`/`pow` are the
  first things to hoist or approximate.
- **`hypot` beats hand-rolled length — confirmed.** `sqrt(x*x + y*y)` is
  `mul + mul + add + sqrt` ≈ 1.0+1.0+1.1+3.5 = **6.6×**; `hypot(x,y)` is **3.6×**.
  Almost 2× cheaper, and clearer. This folklore *holds*, now quantified.
- **Inverse trig is pricey.** `acos` (5.5×) and `asin` (4.8×) rival noise. If a
  port leans on them per-pixel, that's a hot spot.

> Caveats live in `costs.md`: each op is profiled with one fixed argument set, so
> treat the noise family as indicative; `perlinTurbulence` measuring below
> `perlin` is likely an args artifact, not a true per-call ordering.

## 4. Optimization catalogue

### Factor frame-global work into `beforeRender` [bench-verifiable]

The highest-leverage move (§1). Anything identical across pixels — `t`
accumulation, `sin(t)`/`cos(t)` for a rotation angle, palette coefficients,
constants derived from sliders — computes **once per frame** there instead of
once per pixel. The emulator bench will show the call-count drop directly.

This one move accounts for nearly the entire [scoreboard](#what-this-actually-buys--the-measured-scoreboard)
above. The exemplar is **ControlsShowcase (+49.7%)**: four `cos`/`sin` orbit
positions and the orbit/falloff geometry were being recomputed for all 256
pixels though they're identical across the frame; lifting them into a new
`beforeRender` nearly halved frame time, bit-identical. The catch is whole-frame
dilution — see the library-sweep case study for where the same move buys ~0%.

### Precompute loop-index-only work into a table [bench-verifiable + hardware-wisdom]

A generalisation of the move above for patterns with an **inner loop** in
`render`. If an inner-loop expression depends only on the **loop index** (and
maybe time), but never on the pixel, compute it **once into a small array** and
read it in the loop — at *module scope* if it's a pure index constant, in
`beforeRender` if it's also time-dependent. The per-pixel loop then carries only
the genuinely position-dependent work.

This is the highest-leverage move for the "N-iteration loop per pixel" ports
(layered rings, octave sums, kaleidoscope folds). It cuts both **call count**
(bench-verifiable) *and*, when what you hoist is a transcendental, a real
per-built-in cost on hardware (hardware-wisdom) — provable both ways. The two
table flavours:

- **Index-only constants → module scope.** `cos(i)`, `i*k`, anything that's the
  same every frame, filled once in a top-level `for` loop. The `cos` runs in the
  device's own fixed-point at load, so the cached value is bit-identical to
  computing it inline.
- **Index-and-time → `beforeRender`.** Per-ring rotation angles, per-octave
  phases, a time-staggered pulse weight. Refilled once per frame, read by every
  pixel.

> **Keep the multiply order.** Folding `gv * anim * color` into a precomputed
> `gv * weight` (with `weight = anim*color`) *re-associates* the multiplies and
> drifts the Precise/fixed-point checksum. To stay strictly output-preserving,
> table only the invariant *operands* (`anim`, `color`) and leave the per-pixel
> expression's association untouched: `gv * animT[i] * colT[i]`. Same values,
> same order, bit-identical. (See the NeonSquircles case study.)

> **The emulator can't see this win — and reads it backwards.** The bench runs
> every built-in as a native `Math.*` but reaches array elements through a
> heavier path, so swapping per-pixel `sin`/`cos` for array reads makes the
> *emulator* slower even as the *device* gets much faster. Trust the checksum
> (output-preserving) and `devbench` (the real gain), not the bench stopwatch.

### Memoize position-only transcendentals per pixel [bench-verifiable after the change]

When a per-pixel value is an **expensive transcendental of the pixel's position
alone** — time-invariant, the same every frame — cache it in a `pixelCount`-sized
module array, filled once, and read it thereafter. `exp`/`pow`/`asin` of a
fixed `len = hypot(px,py)` are the textbook cases. This is the one move that
turns a **hardware-wisdom** cost (the emulator can't see a `sin`→table swap) into
a **bench-verifiable** one: after the cache fills, the call simply stops
happening, so both the op count *and* the device cost drop, and the checksum
holds (the cached value equals what the body recomputed).

The clean, bit-identical way to fill it is **lazy** — compute on each index's
first visit (with a sentinel for "unfilled"), read on every later frame — because
that uses the exact per-pixel coordinates `render2D` receives. (Prefilling via
`mapPixels` risks a coordinate-normalisation mismatch and a checksum drift.)

> **Memory cost — weigh it deliberately.** An array is the *only* dynamically
> allocated type on Pixelblaze and **cannot be freed** (no GC — [Language
> Reference](../ElectroMage/Pixelblaze%20Language%20Reference.md)), so a
> `pixelCount` cache is permanent, **leaks the old one on any grid-change
> reallocation**, and **scales with LED count**. Fine at a 256-px panel (~1 KB);
> a real liability on a multi-thousand-LED install or a frequently re-mapped one.
> Static `var`s are free by comparison — reach for this *only* when the memoized
> built-in is genuinely expensive (`exp`/`pow`/inverse-trig) and the pixel count
> is bounded. Don't memoize a `sin`; do consider it for a per-pixel `exp`.

> **Device array gotchas (fw 3.67).** `array(0)` is rejected — bare-declare the
> var and allocate `array(pixelCount)` only once `pixelCount > 0` (the map can be
> unready on the first `beforeRender`). Bound-check the subscript (`ix < built`)
> and `floor()` the render `index` before using it. See the Kishimisu case study
> and `FireflyChoir.js` for the proven idiom.

### Cut loop iterations [bench-verifiable]

Cost scales with `pixels × iterations`. Raymarch step counts, noise octaves, and
fold iterations are the usual suspects. Drop the count and check the image still
holds; often 95 steps look identical to 40. The bench confirms the reduction.

### Reduce op count; strength-reduce [bench-verifiable]

- Hoist common subexpressions out of inner loops.
- Replace `pow(x, k)` for small integer `k` with repeated multiplies
  (`pow(x,2)→x*x`, `pow(x,3)→x*x*x`; 8.6× → ~`k-1` muls), and `pow(x, 0.5)` with
  `sqrt(x)`. Note this is **not** output-preserving — `pow` routes through
  `exp`/`log`, so the result differs by a fixed-point ULP (the Fast checksum
  usually survives quantization, Precise drifts); it's a blessed sub-perceptual
  change, *not* a free one. And weigh it against the whole frame: on a frame
  dominated by something else (see the Caustics case study — voronoi-bound), even
  cutting two `pow`s buys ~nothing, so the drift isn't worth it.
- Multiply by a reciprocal once instead of dividing repeatedly (`div` 1.9× vs
  `mul` 1.0×) — but mind the [16.16 overflow cliff](#part-ii--optimizing-glsl--shadertoy-ports)
  on the reciprocal's magnitude.

### Choose cheaper built-ins [hardware-wisdom]

Use the [cost table](#the-measured-cost-table) — the emulator can't see these:

- `exp`/`pow` (8–12×) are the most expensive scalars; approximate or hoist.
- `hypot` (3.6×) over hand-rolled `sqrt(x*x+y*y)` (6.6×).
- `triangle`/`square` (1.6×) over `sin`/`wave` (2.9×) when any periodic shape
  will do.
- Inverse trig (`asin`/`acos`, 4.8–5.5×) is a hot spot if used per-pixel.

### Don't allocate in the hot path

Arrays are the only allocatable type and **cannot be freed**, so allocating
per-pixel or per-frame leaks. Pre-allocate once at module scope.

### Never write an unbounded loop

Patterns run on the **main thread**; a data-dependent `while` that doesn't
terminate **freezes the tab** (and on the device, trips the watchdog). Bound
every loop with a constant or a slider-fed count.

---

# Part II — Optimizing GLSL / ShaderToy ports

Ports are the patterns most likely to be slow: GLSL is written for a GPU that
doesn't care about per-pixel loops or transcendental cost. Everything in Part I
applies; this part covers what's port-specific. For the mechanics of *getting* a
shader running (vector flattening, the `Shader` library, the fixed-point gotchas),
see **[Porting ShaderToy shaders to Pixelblaze](./Porting%20ShaderToy%20shaders%20to%20Pixelblaze.md)** —
this guide picks up at "it runs, now make it fast."

## 5. Why ports are expensive

The GPU idioms that are free on a shader are the costly ones here:

- **Per-pixel loops** — octave/fBm noise sums, raymarch/sphere-trace steps,
  kaleidoscope folds. Each is multiplied by the pixel count (§1).
- **Transcendental-heavy inner loops** — a raymarch SDF that calls `sin`/`pow`
  per step pays the [cost table](#the-measured-cost-table) price per step *per
  pixel*.
- **Recomputing frame-global values per pixel** — time-driven rotations and
  palette setup that the shader recomputed every fragment because it was free to.

## 6. Port-specific techniques

### Hoist time-only math out of the per-pixel path [bench-verifiable]

The biggest win in practice. Any `rot(iTime*…)`, `sin(iTime)`, palette-from-time,
or other expression that depends on `t` **but not on the pixel** belongs in
`beforeRender`. In a raymarcher this means computing the per-step rotation
angles *once per frame* and reading them in the loop, instead of recomputing
`sin`/`cos` per step per pixel. (See the PhantomStar case study below.)

### Spend your transcendental budget deliberately [hardware-wisdom]

Map the shader's per-pixel built-ins against the cost table. A port that called
`pow` and `exp` freely on the GPU is now paying 8–12× per pixel for each. Look
for algebraic simplifications (`pow(x,2)`→`x*x`), and prefer the cheap periodics
where the exact curve doesn't matter.

### Use the integer hash, not the magic-constant hash [hardware-wisdom + correctness]

`fract(sin(dot(p,k))*43758.5453)` is both **wrong** (16.16 overflow — see the
porting guide's Gotcha A) **and** expensive (`sin` + a big multiply per call).
`Shader.hash21`/`hash11` are integer multiply/add — cheaper *and* bit-identical
preview↔hardware.

### Iterate in Fast, ship in Precise

The Precise renderer emulates fixed-point in JS and is measurably slower *in the
dev loop* (`npm run bench` typically reports ~7× for Kishimisu at 64×32, varying
with machine load) — this is an *emulator* tax, not a device cost. Drop
to the Fast renderer to iterate on a heavy pattern, but always do the final
correctness and the on-device perf check in Precise / on hardware.

## 7. Case studies

### The library sweep — one move, sixteen demos, ×500 spread in payoff (#248)

The [scoreboard](#what-this-actually-buys--the-measured-scoreboard) is itself the
case study for §1's whole-frame model. A single pass applied the *same*
technique — factor per-pixel-invariant work into `beforeRender` — across the
whole demo library, measured each on hardware, and got results ranging from
**+49.7%** to **+0.0%**. Every win was checked for bit-identity first (the
emulator checksum held in both modes on all but AuroraSphere's accepted `hypot3`
drift), so the spread is purely about *speed*, not image trade-offs.

The pattern that predicts the payoff:

- **Cheap-frame demos win big.** ControlsShowcase (+49.7%), TestPattern2D
  (+22.1%), GlowingOrb (+14.5%), KaleidoBloom (+12.6%) all have **light per-pixel
  bodies** (a few SDF calls, a `hypot`), so the frame-constant trig being lifted
  was a *large fraction* of the frame. ControlsShowcase is the headline: it had no
  `beforeRender` at all — `time()`, four orbit `cos`/`sin`, and the falloff were
  all recomputed per pixel — and adding one nearly halved frame time.
- **Heavy-frame demos barely move.** PlasmaNebula (+5.5%), NebulaSphere (+4.0%),
  ShaderShowcase (+2.3%) are perlin- or iteration-bound; the same kind of hoist is
  a rounding error against 5–9 `perlinFbm` calls or a 2-octave IQ-palette fold.
  Real and free, but small — exactly as the §1 model predicts.
- **The firmware FPS cap hides wins.** EasedSweep (+0.0%) and TestPattern2D's
  ceiling both pin at **~124.5 FPS** — the device's frame-rate cap on this panel.
  The hoist still removes per-pixel `wave`/ease work (it pays off at higher pixel
  counts), but a rate-capped frame can't report it. Don't read a capped 0% as
  "the optimization did nothing" — read the ms/frame floor instead.

The practical takeaway for picking *what to optimize*: **a `beforeRender` hoist is
nearly free to apply and never hurts, so apply it everywhere — but expect the
payoff only where the hoisted work is a real slice of a not-already-capped
frame.** When a demo is heavy (perlin/raymarch/long iteration loop), stop
hoisting and reach for a quality knob (octaves, steps, iteration count); those are
the only levers big enough to matter, and they live on the far side of the
checksum (see PhantomStar, ZippyZaps, Caustics).

### NeonSquircles (`src/pixelblaze/demos/NeonSquircles.js`) — precompute the per-ring tables (#248)

The cleanest big win on the board, and the worked example for **precompute
loop-index-only work into a table** (§4). The demo draws 20 rotating squircle
rings in a per-pixel `for(i=0..19)` loop, and almost all of the loop's
transcendental cost is **pixel-invariant**:

- **Color** — `cos(ic)`, `cos(ic+1)`, `cos(ic+2)` (where `ic = i+1`) depend on
  *nothing but the loop index*. Pure constants → a module-scope `cos` table
  filled once at load. Removes **60 `cos`/pixel**.
- **Rotation** — `Shader.rot2(px, py, -(t+i)*0.03)` recomputes a `sin`+`cos` of an
  angle that depends only on `t` and `i`, not the pixel. Precompute `rc[i]`/`rs[i]`
  in `beforeRender` (20 entries) and apply the rotation inline. Removes
  **~20 `sin` + 20 `cos`/pixel**.
- **Pulse** — the `smoothstep(…abs(abs(mt - ic*0.1) - 1))` ring weight is
  time-only (`mt = t%2`) and index-only. Also tabled in `beforeRender`.

That's ~100 trig calls plus a `smoothstep` chain per pixel moved off the
per-pixel path, onto a 20-entry-per-frame path. The image is unchanged.

**Output-preserving — both checksums held** (Fast `1f3f932d`, Precise
`3c337ca4`), but it took two care points to keep the *Precise* checksum:

1. **Negate the product, not the operand.** The original forms `angle = (t+i)*0.03`
   then passes `-angle`; writing `na = -(t+i)*0.03` instead negates *before* the
   multiply, and `(-(t+i))*0.03` rounds one ULP differently from `-((t+i)*0.03)`
   in 16.16 — enough to drift the Precise checksum. Mirror the original's order.
2. **Don't re-associate the accumulate.** Keep `gv * animT[i] * colR[i]` (same
   left-to-right order as the original `gv * anim * (cos(ic)+1)`); folding
   `animT*colR` into one precomputed weight reorders the fixed-point multiplies
   and drifts Precise. Table the *operands*, not the product.

**Hardware: 2.46 → 3.08 FPS, +25.3%** (`devbench`, before/after, settle 4 s /
sample 14 s, n=8/5, readings dead stable at 2.5 / 3.1):

| | FPS | ms/frame |
|---|---|---|
| baseline | 2.46 | 406.8 |
| tabled | 3.08 | 324.6 |

Why this one pays off where Kishimisu's pass barely moved and PhantomStar's
didn't at all: the work removed here is **expensive *and* a large fraction of the
frame** — ~100 trig calls/pixel × 2048 pixels, a 2.9–3.2× built-in each, against
a per-pixel body that *is* most of this demo's frame. Contrast the §1 whole-frame
model: a big cut to a body that dominates the frame is a big frame win.

**The bench reads it backwards** — exactly as §4 warns. The emulator runs each
built-in as native `Math.*` but reaches array elements through a heavier path, so
trading per-pixel `sin`/`cos` for table reads made the *emulator* frame ~15×
slower (Fast 2.3 → 34 ms) even as the *device* sped up 25%. The checksum (held)
and `devbench` (+25%) are the truth here; the bench stopwatch is noise.

### Caustics (`src/pixelblaze/demos/Caustics.js`) — hoisting a voronoi-bound frame (#248)

A second sober counterweight to NeonSquircles, and a tidy illustration of the
whole-frame model (§1). Caustics drifts two animated Voronoi layers past each
other; per pixel it calls `Noise.voronoiDist` **twice**, and each call scans a
3×3 cell neighbourhood hashing every cell — ~18 cell-hashes/pixel that **own the
frame**.

- **The hoist [bench-verifiable, output-preserving].** `SCALE`/`sharp` are
  slider-only and the five layer-drift terms are `sin`/`cos` of the time phase
  `ph` — pixel-invariant. Moved to `beforeRender`, removing 5 trig/pixel. Both
  checksums held (Fast `46d774e1`, Precise `5ebcd5b5`). Two fixed-point care
  points kept Precise: fold offsets via *adds* only (exact in 16.16, unlike the
  re-associated *multiply* `SCALE*1.3` would have been), and negate the *product*
  (`-(cos·0.5)`, not the unary-bound `(-cos)·0.5`).
- **Hardware: 2.83 → 2.87 FPS, +1.7%** (`devbench`, settle 3 s / sample 10 s,
  stable). Real but tiny — because the 5 trig calls are a rounding error against
  ~18 voronoi cell-hashes. The frame model predicts exactly this: a free cut to a
  small slice of the frame is a small frame win.
- **The `pow` that wasn't worth it.** The two `pow(·, 3)` (8.6× each) look like
  prime strength-reduction targets (`→ v*v*v`). Measured: **+2.1% with the cube
  vs +1.7% without — no gain past the hoist**, the voronoi cost swamping it, and
  the cube drifts the Precise checksum (`f5c48b5e`). So it was reverted: a Precise
  divergence you can't see *and* can't measure is not a win. **Only the levers the
  voronoi cost can't swamp move this frame** — dropping a layer or shrinking the
  3×3 scan, both quality knobs (image-changing), on the far side of the checksum.

### AuroraSphere (`src/pixelblaze/demos/AuroraSphere.js`) — hoist a frame-global vector + measure hypot3 (#248)

A geometry-aware 3D sphere showcase, and our first *isolated* measurement of the
`hypot3` swap. (It's a `render3D` demo; on the 16×16 *2D* panel the firmware still
runs the full per-pixel body — only the image degenerates — so the FPS is a valid
compute proxy.) Two layered wins:

- **Hoist the great-ring normal [bench-verifiable, output-preserving].** The
  axis `(nx, ny, nz)` derives only from `greatPhase` (time) — `sin`/`cos` of
  `theta`/`phi` plus a wander `sin`, ~5 trig/pixel, *identical for every pixel*.
  Moved whole into `beforeRender` as `gnx/gny/gnz`; render3D just reads them. Both
  checksums held (Fast `8191cd6f`, Precise `b09f3de4`). **Hardware: 9.81 → 10.38
  FPS, +5.9%.**
- **`hypot3` over hand-rolled length [hardware-wisdom].** The unit-sphere
  normalize `sqrt(px*px+py*py+pz*pz)` → `hypot3(px,py,pz)` (6.6× → 3.6×). Fast
  checksum held; Precise drifted (`e9839f4b`) — accepted, since this demo is
  already declared non-bit-faithful (asin/atan2, REFERENCE 8.4). **Marginal gain
  measured in isolation: +5.9% → +7.0%, i.e. ~+1.1%** (9.81 → 10.50 total).

The `hypot3` datapoint is the lesson: the cost table says it's ~2× cheaper *per
call*, but it's one call against a per-pixel body that also runs `asin`, two
`samplePalette` ramp-walks, and the rings math — so a ~3-×mul saving lands as
~1% of the frame. Real, worth keeping (it's also clearer), but another instance
of §1: price the swap against the *whole frame*, not the call.

### Kishimisu (`src/pixelblaze/demos/Kishimisu.js`) — a full measured pass (#248)

The canonical "1.4 KB of beauty" kaleidoscope: a 4-octave fold, an IQ cosine
palette per octave, a sharpened sine ring. It's a *clean* port to begin with, so
it makes a good worked example of the **bench-verifiable / hardware-wisdom split**
— the optimizations are all real and correct, yet the emulator stays nearly flat.

**Method.** Baseline, then one change at a time, re-benching after each (3 runs,
64×32, 120 frames) and gating on the per-mode checksum.

| step | change | tag | Fast checksum | Precise checksum |
|---|---|---|---|---|
| 0 | baseline | — | `42265145` | `5427e6fb` |
| 1 | 5 slider→range remaps → `beforeRender` | bench-verifiable | held | held |
| 2 | `t*0.4` hoisted; per-octave `÷ringDensityM` → `×(1/ringDensityM)` | mixed | held | **drifts → `a6b511ef`** |
| 3 | per-octave palette phase `i*0.4` → running `+0.4` accumulator | bench-verifiable | held | held |

Frame time stayed inside ±5% run-to-run noise at every step (Fast ~0.83 ms,
Precise ~6.0 ms). **That flatness is the lesson, not a failure:** the emulator
runs every built-in as a native `Math.*` call, so the ops these steps remove
(`mul`/`add`/`div`/`floor`/`clamp`) are all near-free there, while the per-octave
`cos`/`sin`/`pow` and the per-pixel `exp` — untouched — dominate. The bench's job
in a pass like this is the **checksum guard**, not the stopwatch.

**The hardware story the bench can't show.** Pricing the per-pixel body against
the [cost table](#the-measured-cost-table) (units = ×mul, 4 octaves):

- Steps 1–3 trim **~297 → ~266 ×mul/pixel (~10%)**, output-preserving and free on
  the device — invisible in the emulator for the reason above.
- **Two items own the per-octave cost:** the palette's **3× `cos` (~22 ×mul, ~37%)**
  and the **`pow(glowM/d, sharpnessM)` (~10.5 ×mul, ~17%)**. Neither hoists
  (`cos`'s phase carries the per-pixel `len0`; `sharpnessM` is a non-integer
  slider, so no `pow(x,2)→x*x`). They are the ceiling for a faithful render.
- **`exp(-len0)` is ~13.8 ×mul *per pixel* and time-invariant** (a pure function of
  position), so it's the textbook **per-pixel memoization** target (§4). Now
  *done and measured:* cached lazily into a `pixelCount` array, filled on each
  index's first visit. Bit-identical (both checksums held, `7b85cec1`/`27e503fe`),
  and **9.20 → 9.43 FPS, +2.5%** on hardware (`devbench`, n=6/7, dead stable) — on
  top of steps 1–3, ~**8.4% total** from the original. The gain is modest for the
  same whole-frame reason: `exp` is one cost among the per-octave `cos`/`pow`.
  This is the one item here memoization turned **bench-verifiable** (the `exp`
  calls stop after frame 1). It ships with eyes open about the memory trade — a
  `pixelCount` array that can't be freed (§4's memory note) — justified at the
  panel's 256 px, and the in-code comment flags when it wouldn't be.
  - *Two device gotchas surfaced doing it:* `array(0)` is rejected by fw 3.67 (so
    allocate only once `pixelCount > 0`), and the subscript must be bound-checked
    and `floor()`ed — folded into §4's gotcha note and `FireflyChoir.js`'s idiom.
- **`octavesM` is the biggest single dial** — it multiplies the whole per-octave
  cost. Dropping 4→3 is ~23% off the frame, but it **changes the image**: a
  quality knob, not a free win. Keep it on the checksum's *other* side of the line.

**The reciprocal caveat (step 2).** Replacing the per-octave divide with a
precomputed reciprocal is a genuine speedup on hardware (`div` 1.9× → `mul` 1.0×)
but a deliberate 16.16 divergence: the **Fast (float64) checksum holds**, the
**Precise (fixed-point) checksum shifts**. Accepted here — the shipped device code
uses the same reciprocal, and the delta is a sub-perceptual one-level flip on a
handful of pixels. This is the template for "consciously accept + document drift":
prove Fast is untouched, confirm the Precise drift is *only* the known fixed-point
identity, and write down why.

**Closing the loop on real hardware.** Both versions were bundled to device
dialect and hand-loaded into the ElectroMage editor on a physical Pixelblaze
(fw 3.67, 16×16 panel), reading the editor's FPS counter:

| | FPS | frame time |
|---|---|---|
| baseline | 8.7 | 114.9 ms |
| optimized | 9.1 | 109.9 ms |

**+4.6% — real and repeatable, but well short of the ~10% compute estimate, and
the gap is the lesson.** The ×mul model prices only the per-pixel *arithmetic
body*; the frame also pays fixed overhead the optimization never touches — walking
the map, driving the LEDs, framework/WS housekeeping. Back-solving
`0.10 × f = 0.044` puts the body we trimmed at **~44% of the frame**, the rest
fixed. So: **to predict an FPS gain, model the whole frame, not just the hot
loop** — a 10% cut to a body that's half the frame is a 5% cut to the frame. The
big-ticket items (the per-octave `cos`/`pow`, the octave count) are where a
*dramatic* win would have to come from, and none of those are free.

### PhantomStar (`src/pixelblaze/demos/PhantomStar.js`) — when hoisting runs out of road (#248)

A volumetric raymarched IFS fractal — the heaviest port we ship, and a sober
counterweight to the "hoist and the cost collapses" reflex. A ~95-step
raymarcher with a 5-iteration fold per step is ≈ 95 × 5 × pixels fold
evaluations per frame; on the 16×16 panel it renders at **~0.24 FPS (≈4.2
s/frame)** on fw 3.67. That is the headline: hoisting did **not** make this
pattern viable, and the measurements say why.

**Two kinds of hoist, only one of them big.**

- **The structural hoist — already done, and it's the real one.** Every
  `rot(iTime·…)` angle in the fold is time-only, not position-dependent, so the
  three rotation matrices (`c03/s03`, `c01/s01`, `cf/sf`) compute **once per
  frame** in `beforeRender` and the fold just reads them — instead of
  recomputing `sin`/`cos` per step per pixel. This is the textbook win, and it is
  baked into the demo as shipped.
- **The incremental hoist — correct, free, and negligible.** A later pass (#248)
  also moved the per-pixel `iters`/`steps`/`gain` and the per-step `ringT = 24·t`
  out of the hot paths. Output-preserving (the bench checksum is **identical in
  both modes**), but the *hardware* delta is **+0.1% FPS — inside measurement
  noise** (devbench, before/after, n=10 each, settle 6 s / sample 40 s; the
  firmware quantises FPS to 0.2 so both versions read 0.24):

  | | FPS | ms/frame |
  |---|---|---|
  | before (rotation-hoist only) | 0.24 | 4250 |
  | after (+ scalar/ringT hoist) | 0.24 | 4245 |

  **Δ +0.1%, i.e. zero.** What this hoist removed — two `floor`s and a few
  `mul`/`add` per pixel, one `mul` per step — is a rounding error against a
  95-step raymarch whose every step runs a 5-iteration fold plus `exp` (12.2×)
  and `hypot3`.

**The lesson: a hoist is only worth what you hoist.** Factoring invariants into
`beforeRender` is the highest-leverage *general* move (§1), but its payoff is
bounded by the cost of the thing you move. Here the genuinely expensive work —
the per-step IFS fold, `exp(-dist·3)`, the ring `hypot3` — is a function of the
per-pixel ray position and the per-step distance, so it is **structurally
unhoistable**. The only levers that move PhantomStar's FPS materially are the
ones the bench can see and the checksum guards against: **cutting march steps and
fold iterations** (the `quality`/`depth` knobs) — and those change the image, so
they live on the *other* side of the checksum line. Reach for them, measured and
labelled, when a port is this far over budget; don't expect another hoist to
save it.

- Watch the `fx` identifier shadow (porting guide §4.B) — orthogonal to perf, but
  it bites in exactly these heavy ports.

---

## See also

- [`test/perf-harness/costs.md`](../../test/perf-harness/costs.md) — the measured
  cost table (source of record); regenerate with `npm run profile` (#245).
- [Porting ShaderToy shaders to Pixelblaze](./Porting%20ShaderToy%20shaders%20to%20Pixelblaze.md)
  — getting a shader running before you tune it; the fixed-point gotchas.
- `docs/PXLBLZ Technical Reference.md` §2/§5 (fidelity & the fixed-point engine),
  §11 (the porting toolkit), §16 (main-thread execution).
- `test/perf-harness/` — the emulator bench (`npm run bench`, #247) and the
  hardware profiler (`npm run profile`, #245).
