# Porting ShaderToy shaders to Pixelblaze

You found a shader on [ShaderToy](https://www.shadertoy.com) you want running on your LEDs. This guide takes you from its GLSL to a working Pixelblaze pattern.

**Who this is for:** you can read GLSL and are learning Pixelblaze's constraints. You do *not* need to know fixed-point arithmetic going in — the one place it bites is called out as a headline gotcha below.

**What does the mechanical work:** the `Shader` library (`src/pixelblaze/lib/Shader.js`) fills the GLSL gaps Pixelblaze's built-ins don't already cover — a floor-based `fract`, `step`, vector helpers, the IQ palette, a hardware-safe hash. It is loaded automatically; call it as `Shader.*` with no import. It deliberately **never re-implements a built-in** — `mix`, `smoothstep`, `clamp`, `mod`, `hypot` are already there and GLSL-shaped, so you map straight onto them.

**The one thing to internalise:** the preview defaults to the **Precise renderer**, which emulates the hardware's 16.16 fixed-point arithmetic. That is the point — a pattern that looks right under the Precise renderer will look right on the device. The most common GLSL idiom that *looks* fine but breaks on hardware is the magic-constant hash (`fract(sin(x)*43758.5453)`); see [Gotcha A](#a-the-1616-overflow-cliff-the-1-porting-hazard).

---

## 1. Workflow

1. **Draft and verify in ShaderToy first.** Get the original rendering correctly in the browser so you have a reference image to compare against. Note its `iTime`, `iResolution`, and `iMouse` dependencies.
2. **Flatten vectors to scalars.** Pixelblaze has no `vec2`/`vec3`/`mat2` and no per-pixel dynamic allocation (the only allocatable type is the array, and arrays can't be freed). Rewrite each vector as its scalar components — `vec2 p` becomes `px, py` — *on paper* before you touch the editor. This is the bulk of the manual work; see the [mapping reference](#2-mapping-reference).
3. **Port the body** into `render2D(index, x, y)`, substituting built-ins and `Shader.*` per the mapping table. Lift per-frame uniforms (`iTime`) into `beforeRender`.
4. **Check in the Precise renderer.** Compare side-by-side with your ShaderToy reference. Most divergence at this stage is one of the five [gotchas](#3-gotchas) — overflow, aspect, `fract`/`frac`, `iTime`, or perf.
5. **Tune.** Expose the shader's magic numbers as `export var` sliders so you can dial it in live. Drop to the **Fast renderer** (the float64 escape hatch) if a heavy pattern is too slow to iterate on, but always do the final check in the Precise renderer.

---

## 2. Mapping reference

Every GLSL construct falls into one of three buckets:

- **built-in** — Pixelblaze already has it with a GLSL-matching signature. Use it directly. **Do not** polyfill these.
- **`Shader.*`** — a gap GLSL has that Pixelblaze doesn't; the library fills it.
- **manual** — no one-to-one mapping; you rewrite it by hand (almost always vector → scalar unrolling).

### Math & common functions

| GLSL | Pixelblaze | Bucket | Notes |
|---|---|---|---|
| `mix(a, b, t)` | `mix(a, b, t)` | built-in | identical signature |
| `smoothstep(e0, e1, x)` | `smoothstep(e0, e1, x)` | built-in | `e1 >= e0`; clamps |
| `clamp(x, lo, hi)` | `clamp(x, lo, hi)` | built-in | |
| `mod(x, y)` | `mod(x, y)` | built-in | floored, sign of `y` — matches GLSL. (Note `%` does **not**: it truncates.) |
| `abs`/`floor`/`ceil`/`sqrt`/`pow`/`exp`/`log`/`sin`/`cos`/`tan`/`min`/`max` | same name | built-in | `sin`/`cos`/`tan` take radians, as in GLSL |
| `atan(y, x)` | `atan2(y, x)` | built-in | note the **name and arg order** |
| `length(v)` | `hypot(x, y)` / `hypot3(x, y, z)` | built-in | unrolled to scalar args |
| `fract(x)` | `Shader.fract(x)` | **`Shader.*`** | **not** built-in `frac` — see [Gotcha C](#c-fract-vs-frac) |
| `step(edge, x)` | `Shader.step(edge, x)` | `Shader.*` | |
| `sign(x)` | `Shader.sign(x)` | `Shader.*` | |
| `clamp(x, 0., 1.)` / `saturate(x)` | `Shader.saturate(x)` | `Shader.*` | convenience for the unit clamp |
| `dot(a, b)` | `Shader.dot2(ax,ay, bx,by)` / `Shader.dot3(…)` | `Shader.*` | unrolled |
| `distance(a, b)` | `Shader.distance2(ax,ay, bx,by)` | `Shader.*` | = `hypot(ax-bx, ay-by)` |
| `normalize(v)` | `Shader.normalize2/3(...)` → `nx,ny[,nz]`,`len` | `Shader.*` | out-var (see below) |
| `reflect(i, n)` | `Shader.reflect2/3(...)` → `rx,ry[,rz]` | `Shader.*` | out-var; `n` assumed normalized |
| `v * mat2(rot(a))` | `Shader.rot2(x, y, a)` → `rx,ry` | `Shader.*` | the rotation idiom; out-var |

### Vectors, matrices, swizzles — **manual**

| GLSL | Pixelblaze | How |
|---|---|---|
| `vec2 p = …` | `var px = …, py = …` | one scalar per component |
| `vec3`/`vec4` | scalars + an explicit `w`/alpha if used | unroll |
| `p.xy`, `p.yx`, `c.bgr` | reorder the scalars | swizzle is just renaming |
| `a + b`, `a * s` (componentwise) | per-component scalar ops | `rx = ax + bx; ry = ay + by;` |
| `mat2`/`mat3` (general) | scalar multiply-adds | only the `rot` case has a helper (`Shader.rot2`); write the rest out |
| arrays / loops over a vector | a Pixelblaze `for` loop over scalars | fine, but watch the [perf budget](#e-loopperf-budget) |

### ShaderToy uniforms & I/O

| GLSL | Pixelblaze | Bucket | How |
|---|---|---|---|
| `iTime` | `t`, accumulated in `beforeRender` | manual | `t += delta * 0.001` — see [Gotcha D](#d-itime) |
| `iResolution` | `aspect = cols/rows` | manual | no built-in; supply it — see [Gotcha B](#b-aspectiresolution) |
| `fragCoord` (pixels) | `x, y` args to `render2D` (already 0..1) | manual | centre + scale via `Shader.toUV(x, y, aspect)` → `ux, uy` |
| `fragColor` (output) | `rgb(r, g, b)` or `hsv(h, s, v)` | built-in | call once per pixel at the end |
| `iMouse` | an `export var` slider | manual | wire to a UI control |
| `iChannel*`, texture sampling | — | **won't port** | see [section 5](#5-wont-port) |

### Procedural staples

| GLSL idiom | Pixelblaze | Bucket | Notes |
|---|---|---|---|
| IQ cosine palette `a + b*cos(2π(c·t+d))` | `Shader.iqPalette(t, a…, b…, c…, d…)` → `cr,cg,cb` | `Shader.*` | per-channel `a,b,c,d`; out-var |
| `fract(sin(dot(p, k))*M)` hash | `Shader.hash21(ix, iy)` / `Shader.hash11(n)` | `Shader.*` | **integer cell coords in**; hardware-safe — see [Gotcha A](#a-the-1616-overflow-cliff-the-1-porting-hazard) |
| `perlin`/`prng`/`noise` | `perlin(...)` / `prng(...)` built-ins | built-in | **algorithmically divergent** — preview-approximate, not bit-identical to hardware (ADR-0003) |

### The out-var contract

Helpers that would return a vector can't (no vectors), so they write **module-level globals** instead — exactly as `Color.js`'s `lerpHSV` writes `outH`/`outS`/`outV`. These are **shared temporaries**: read them into your own locals *immediately*, before the next `Shader.*` call overwrites them.

| Helper | Writes |
|---|---|
| `Shader.toUV` | `ux, uy` |
| `Shader.normalize2/3` | `nx, ny, nz`, `len` |
| `Shader.rot2`, `Shader.reflect2/3` | `rx, ry, rz` |
| `Shader.iqPalette` | `cr, cg, cb` |

```js
Shader.toUV(x, y, 1)
var px = ux, py = uy     // read out-vars NOW
Shader.rot2(px, py, a)   // this would clobber ux/uy if we'd waited — but it writes rx/ry
px = rx; py = ry
```

---

## 3. Gotchas

### A. The 16.16 overflow cliff (the #1 porting hazard)

Pixelblaze numbers are **16.16 fixed-point**: range ±32768, precision 1/65536. The classic GLSL pseudo-random hash —

```glsl
float h = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
```

— breaks on hardware in **two** independent ways:

1. **Unrepresentable constant.** `43758.5453` is comfortably inside ±32768, but the intermediate `value × 65536` (how the raw int is formed) and the products built from these large magic numbers **overflow int32 and wrap** rather than saturating. The hash's whole job is to *amplify* tiny input differences into chaos, so an overflow-wrap doesn't degrade gracefully — it produces a *different* chaotic value than the GPU, and the texture is wrong.
2. **`sin` is algorithmically divergent.** Even with no overflow, the firmware's `sin` is not bit-identical to the preview's (ADR-0003). Feeding a divergent `sin` into a hash multiplies the divergence.

Under the float64 **Fast renderer** both problems are invisible — which is exactly why the **Precise renderer is the default**. It surfaces the bug before you upload.

**The fix:** don't port the magic-constant hash at all. Use the library's integer hash, which is pure multiply/add over representable constants and **validated bit-identical preview↔hardware** (divergence harness, fw 3.67):

```js
// GLSL: hash on continuous coords → multiply up to integer cells first
var h = Shader.hash21(floor(px * 40), floor(py * 40))   // 2D cell → [0,1)
var n = Shader.hash11(floor(seed))                       // 1D     → [0,1)
```

> Why the library survives where the naive port doesn't: its constants stay ≤ ±32767, it uses no bit-shifts (`>> 13` emits as `>> 0`) and no `~`/`| 0`, and it demotes the wrapped int with `/ 256 / 256` (power-of-two, bit-exact) rather than `* (1/65536)` — that sub-ULP literal flushes to raw 0 in the firmware parser and collapsed every hash to 0 on the device (#111/#113). You don't need to reproduce any of this; just call `Shader.hash21/11`.

**General rule:** any constant or product whose magnitude approaches ±32768 is suspect under Fidelity. Watch large multipliers, accumulators in long loops, and `x * bignum` scalings. If the preview looks right in Fast mode and wrong in Fidelity, you've found an overflow.

### B. Aspect / `iResolution`

ShaderToy's canonical normalisation divides by the **short axis** so the image isn't stretched:

```glsl
vec2 uv = (fragCoord*2.0 - iResolution.xy) / iResolution.y;  // short axis = unit
```

Pixelblaze's `render2D` hands you `x, y` already in `[0, 1]` per axis. Don't just write `x*2-1, y*2-1` — on a non-square grid that stretches the image. Route through:

```js
Shader.toUV(x, y, aspect)   // ux = (x*2-1)*aspect, uy = (y*2-1);  aspect = cols/rows
var px = ux, py = uy
```

with `aspect = cols / rows` so the short axis spans the unit, matching `/iResolution.y`. This honours the project's 2D uv convention — centre at `(0,0)`, unit fit to grid aspect — documented on `Shader.toUV` in `src/pixelblaze/lib/Shader.js`.

> **Current limitation (#116):** the preview normalises each axis to `[0,1]` independently and exposes **no `cols`/`rows` built-in** to derive a real aspect from, so today you hardcode `Shader.toUV(x, y, 1)`. On a square grid this exactly reproduces the original's `2x-1 / 2y-1`; on a non-square grid it stretches — an accepted limitation until a real `aspect` can be threaded through. Write `Shader.toUV(x, y, 1)` now and the call site is already correct for when #116 lands.

### C. `fract` vs `frac`

Pixelblaze ships a built-in `frac`, but **it is not GLSL's `fract`**:

- GLSL `fract(v) = v - floor(v)` — always in `[0, 1)`.
- Pixelblaze `frac(v) = v - trunc(v)` — **same sign as `v`**. `frac(-5.5) == -0.5`.

They agree for positive inputs and diverge by 1 for negative ones. This bites hardest in the ubiquitous symmetric fold `fract(uv) - 0.5` (Kishimisu, IQ kaleidoscopes, any lattice): with truncate-based `frac`, the half of the canvas where the coordinate goes negative folds into the wrong region. The result looks subtly off, not obviously broken — easy to miss.

**Always use `Shader.fract` (floor-based) for ports.** (Equivalently, inline `x - floor(x)`.) Don't reach for `frac` and don't ask for the engine's `frac` to be "fixed" — it is faithful to real hardware, and changing it would break patterns written against the device.

### D. `iTime`

There is no global clock you read mid-render. Accumulate time once per frame in `beforeRender`, whose `delta` argument is **milliseconds since the last frame** (the IDE's speed control is already folded into `delta`):

```js
export var t = 0
export function beforeRender(delta) {
  t = t + delta * 0.001    // t is now iTime in seconds
}
```

Use `t` anywhere the shader used `iTime`. For values that should loop cleanly, prefer the built-in `time(interval)` (a 0..1 sawtooth) or wrap with `mod(t, period)`.

### E. Loop/perf budget

Patterns run **on the main thread** (ADR-0002), and Fidelity's fixed-point arithmetic is **~3–8× slower** than float64. Your cost is roughly *pixels × per-pixel work*, and ShaderToy shaders love per-pixel loops (octaves, raymarch steps).

- 16×16 and 32×32 grids with typical fragment shaders stay interactive under the Precise renderer.
- Deep raymarchers on 64×64 will not — that's what the **Fast renderer** toggle is for (iterate in float64, do the final precise check at the grid size you'll actually run).
- **No dynamic allocation in the hot path.** Arrays are the only allocatable type and can't be freed, so allocating per-pixel leaks. Pre-allocate any array once at module scope.
- A syntactically valid infinite loop **freezes the tab** (main-thread execution) — bound every loop with a constant or a slider-fed count, never a data-dependent `while` that might not terminate.

---

## 4. Worked example

> _Stub — to be completed by the cold port in #97._
>
> A classic ShaderToy shader, ported start-to-finish strictly through this guide, will live here: the original GLSL, the scalar-flattened plan, the finished Pixelblaze pattern, and a note on every gotcha it tripped. Any gap the port surfaces (a missing `Shader.*` helper, an unclear mapping) gets folded back into the library and this guide rather than worked around locally.

---

## 5. Won't port

These rely on GPU features Pixelblaze's per-pixel model has no equivalent for. They're out of scope for v1 — listed here so you can recognise them in a shader and stop early rather than fight them.

| GLSL feature | What it is | Why it doesn't map |
|---|---|---|
| `iChannel*` / `texture()` / `texelFetch()` | Sampling input textures (images, video, the keyboard, other buffers). | No texture memory or sampler hardware; `render2D` computes each pixel from coordinates alone. A small lookup *could* be faked with an array, but general texturing can't. |
| Multipass / feedback buffers (`Buffer A`→`Buffer B`) | A shader reading last frame's output of another pass — trails, reaction-diffusion, fluid. | One pass, no persistent framebuffer to sample. You'd have to keep state in arrays and update it yourself; not a mechanical port. |
| `dFdx` / `dFdy` / `fwidth` | Screen-space derivatives (anti-aliasing, analytic edges). | Pixels are computed independently with no neighbour access, so there's no derivative to take. |
| `discard` | Kill a fragment so nothing is written. | Every LED gets a colour every frame; "don't draw" means write black (`rgb(0,0,0)`). |
| MRT (multiple render targets) | Writing several output buffers at once. | A single colour output per pixel; no extra targets. |

*Maybe later:* small textures via lookup arrays, and single-buffer feedback via persistent arrays, are conceivable extensions — but v1 ships no workarounds for these. If a shader's core effect depends on any of the above, it isn't a porting candidate yet.

---

## See also

- `src/pixelblaze/lib/Shader.js` — the library inventory and the out-var contract, in code.
- `src/pixelblaze/demos/Kishimisu.js`, `NeonSquircles.js` — worked ports built on `Shader.*` (`toUV`, `fract`, `iqPalette`, `rot2`).
- `docs/prd/Feature — Hardware-Fidelity Preview & ShaderToy Porting.md` — why Fidelity is the default and how the two divergences (numeric vs algorithmic) differ.
- `docs/adr/0003-fixed-point-fidelity-default.md` — the fixed-point fidelity decision.
