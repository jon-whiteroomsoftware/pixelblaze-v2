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

### Cut loop iterations [bench-verifiable]

Cost scales with `pixels × iterations`. Raymarch step counts, noise octaves, and
fold iterations are the usual suspects. Drop the count and check the image still
holds; often 95 steps look identical to 40. The bench confirms the reduction.

### Reduce op count; strength-reduce [bench-verifiable]

- Hoist common subexpressions out of inner loops.
- Replace `pow(x, 2)` with `x*x` (8.5× → 1.0×), `pow(x, 0.5)` with `sqrt(x)`.
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
  position). It's already hoisted out of the octave loop; the next move would be
  to **memoize it per pixel index** into a module array filled once — the one
  hardware-wisdom item here that memoization could turn bench-verifiable (it would
  drop ~2048 `exp` calls/frame in steady state). Not yet done: it's a structural
  change (a `pixelCount`-sized cache + a grid-change guard) weighed against the
  demo's readability.
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

### PhantomStar (`src/pixelblaze/demos/PhantomStar.js`)

A volumetric raymarched IFS fractal — the heavy case, and the textbook
hoisting win:

- A ~95-step raymarcher with a 5-iteration fold per step is far over budget
  ported naïvely (≈ 95 × 5 × pixels evaluations of the fold).
- **The fix is faithful, not a shortcut:** every `rot(iTime*…)` angle in the fold
  is **time-only, not position-dependent**. So all of that `sin`/`cos` hoists
  into `beforeRender` and computes **once per frame** instead of per-step
  per-pixel. The image is identical; the cost collapses.
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
