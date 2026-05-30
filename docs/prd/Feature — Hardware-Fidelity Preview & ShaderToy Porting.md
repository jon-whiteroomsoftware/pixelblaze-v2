# Feature PRD — Hardware-Fidelity Preview & ShaderToy Porting

**Status:** in progress — Phases 1–3 shipped; Phase 4 in progress (demo hardening + `Shader.*` refactor done, #96; porting guide #95 and cold port #97 outstanding)
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Supersedes:** ADR-0001 (via ADR-0003)
**Related:** ADR-0002 (main-thread execution), ADR-0003 (fixed-point fidelity default)

---

## Summary

This feature makes the IDE preview **faithful to Pixelblaze hardware's 16.16 fixed-point arithmetic** and then builds a **GLSL/ShaderToy porting toolkit** (a `Shader` library + a porting guide) on top of that faithful base. The two are sequenced deliberately: porting is only worth doing if a pattern that looks right in the preview actually survives upload to a device, and the most common GLSL idioms break on hardware in ways a float64 preview cannot show.

It ships in four phases:

1. **Hardware-fidelity preview** — a 16.16 fixed-point emulation engine (the default "Precise" renderer), with a float64 "Fast" renderer escape hatch.
2. **De-bug existing assets** — fix the latent hardware bugs the fidelity engine now exposes (notably `Noise.js` hashes and `PlasmaNebula`'s star hash) and the square-grid coordinate assumptions.
3. **`Shader` library + porting guide** — the porting-specific abstraction layer and documentation.
4. **Demo overhaul** — harden all five shader-style demos, refactor the two explicit ports onto `Shader.*`, and validate the toolkit with one fresh cold port done strictly through the guide.

Phases 1–2 benefit **every** pattern, not just ports. Phases 3–4 are porting-specific.

---

## Goals

- A designer can trust the preview: **what the preview shows is what the hardware does**, for the numeric domain (range, precision, overflow), within documented exceptions.
- A Pixelblaze user who finds a ShaderToy shader can get it running on their LEDs by following a guide, with a library that absorbs the mechanical parts of the port.
- The existing shader-style demos run correctly on real hardware and become worked references for the porting workflow.

## Non-goals

- **Automated GLSL→Pixelblaze transpilation.** Porting remains human-driven with library support; the deferred "Shader import" idea in the main PRD is *not* what this feature delivers.
- **Bit-exact firmware built-ins.** `perlin`, `prng`, `wave`, and transcendental LUTs are not reverse-engineered to match firmware bit-for-bit (see Divergence, below).
- **Porting GPU-only features.** Textures/`iChannel`, multipass feedback buffers, derivatives (`dFdx`/`fwidth`), `discard`, MRT are out of scope and documented as non-portable.
- **3D / `render3D` porting.** Follows the main PRD's 3D deferral.

---

## Background: two independent divergences

WYSIWYG-on-hardware has **two** gaps, and they are independent:

1. **Numeric divergence** — float64 vs 16.16 fixed-point (range ±32768, precision 1/65536, int32-wrap overflow, bitwise ops over the raw 32 bits). **Phase 1 closes this.**
2. **Algorithmic divergence** — the runtime shim (`src/engine/shim.ts`) implements `perlin` as Ken Perlin's 2002 reference (explicitly "not bit-identical to firmware") and `prng` as mulberry32, which are *different algorithms* than the firmware's. Even in perfect fixed-point these return different values. **Phase 1 does not close this; it is documented and, where it matters, designed around.**

A consequence used throughout Phase 3: the only constructs that are bit-identical on both sides once fixed-point + overflow match are **pure arithmetic ops** (no `sin`, no `perlin`). So fidelity-critical hashing is built from integer arithmetic, not from `sin`-based or `perlin`/`prng`-based constructs.

### Critique of the prior porting notes

A previous AI-authored porting document (`GLSL to Pixelblaze porting.md`) informed this work but was validated skeptically. Findings carried into the guide:

- **Correct:** unroll vectors to scalars (arrays are the only dynamic allocation and can't be freed); use `beforeRender` for per-frame uniforms; accumulate `t += delta*0.001` for `iTime`; polyfill `step`; provide a floor-based `fract`.
- **Wrong/outdated:** it polyfills `mix`, `smoothstep`, and `clamp` — all three are Pixelblaze **built-ins** already, with GLSL-matching signatures. The `Shader` library must **not** re-polyfill them.
- **Naming collision:** Pixelblaze ships `frac` (truncate-based); a GLSL floor-based `fract` must be a distinct, namespaced name (`Shader.fract`).
- **Dangerously omitted:** the 16.16 overflow cliff (the central porting hazard) and aspect-ratio correction. Both are headline gotchas in the guide.

---

## Phase 1 — Hardware-fidelity preview (fixed-point engine)

### Representation

Every pattern number is its **raw int32** = `round(value × 65536)`. Because `±32768 × 65536 = ±2³¹`, the raw value fits int32 exactly. Values are kept in raw form throughout pattern execution (not converted to/from float per operation), so intermediate overflow is reproduced faithfully.

### Operator semantics (`fx.*`)

The fixed-point emit wraps each operator node from the Acorn AST in an `fx` helper. Reference semantics:

| Op | Faithful rule |
|---|---|
| `fromFloat(v)` | `Math.round(v * 65536) | 0` (literals + built-in results enter here) |
| `toFloat(raw)` | `raw / 65536` (only at the canvas boundary) |
| `add(a,b)` / `sub(a,b)` | `(a + b) | 0` / `(a - b) | 0` — int32 wrap |
| `mul(a,b)` | exact 64-bit product `a·b`, arithmetic `>> 16`, then wrap to int32 (see Appendix A) |
| `div(a,b)` | `Math.round(a * 65536 / b) | 0` — `a*65536 ≤ 2⁴⁷` stays under 2⁵³ |
| `mod(a,b)` | floored remainder, sign of `b` (matches firmware `mod`) |
| `frac(a)` | truncate-based: `a - trunc(a)` (matches firmware `frac`; **not** floor-based) |
| `&` `|` `^` `~` `<<` `>>` | operate on the **raw int32** (matches firmware "bitwise over 32 bits"); `~` zeros the low 16 bits |
| `<` `>` `<=` `>=` `==` `!=` | compare raw ints directly (order-preserving; no wrap needed) |

- **Multiply is the only expensive op.** float64 loses bits past 2⁵³ (product reaches 2⁶²), so a correct multiply needs a `Math.imul`-based 32×32→64 decomposition (~6–10 ops). BigInt is correct but too slow for the hot path.
- **Overflow = int32 wrap** — **confirmed** against a real device (divergence harness, fw 3.67, 2026-05-29): overflow wraps, not saturates. Multiply, `frac`, and `%` all **truncate** (sign of the dividend), and bitwise ops integer-coerce their operands first. See ADR-0003 Consequences for the full confirmed table.

### Transcendentals and built-ins (the `fx.*` seam)

- Each built-in is wrapped: `fxBuiltin(...rawArgs) = fromFloat( floatBuiltin( ...rawArgs.map(toFloat) ) )`. So a built-in's *internals* run in float64 and its result is quantized to the 16.16 grid.
- This makes `sin/cos/sqrt/pow/exp/log` **close** (precision-only divergence) and `perlin/prng/wave` **algorithmically divergent** (documented).
- The seam is per-function, so a firmware-matched LUT can later replace `fx.sin` etc. **only for functions the divergence harness flags as visibly wrong.**

### Transpiler / runtime integration

- The fixed-point transform is a **preview-only second emit mode** off the existing AST in `bundle()` — it does not change the downloaded/copied hardware artifact (`code`), which stays plain source. Hardware does fixed-point natively.
- The runtime (`loadPattern`) chooses the emit based on the active fidelity mode and evaluates via the existing `new Function(...builtins, body)` path, injecting the **fixed-point built-in shim** (raw-in/raw-out wrappers) instead of the float64 shim when in fidelity mode.
- Numeric literals and built-in constants (`PI`, `PI2`, …) are converted to raw at emit time.

### Fast-renderer escape hatch

- A per-pattern toggle: **Precise** (default) ↔ **Fast** (float64).
- Heaviness is intrinsic to a pattern, so the choice is **persisted with the pattern** (extends the IndexedDB pattern record), not held only in transient session state.
- Surfaced as a preview-pane control near playback. Default for new and imported patterns is the Precise renderer.
- (Future, not v1: auto-suggest the Fast renderer when a pattern's frame time under the Precise renderer exceeds a budget.)

### Divergence harness

A development/test tool, not a shipped UI feature:

- The documented websocket API exposes no per-pixel output frame, but it does expose `getVars`. The harness uploads a **probe pattern** that writes a computed value into an exported var at a sentinel pixel index (`if (index == PROBE) probe = f(x)`), sweeps inputs via `setVars`, and reads results via `getVars`.
- This characterizes any built-in (or arithmetic sequence) **numerically** against a real device, quantifying divergence per built-in and gating the optional transcendental-LUT upgrade.
- Output: a per-built-in divergence report (max |Δ|), checked into the repo as evidence behind the "measure-first" decision.

### Performance

- Arithmetic-heavy patterns: ~3–8× slower than float64. 16×16 / 32×32 grids with typical shaders stay interactive; 64×64 deep raymarchers will not — hence the escape hatch.
- Main-thread execution is unchanged (ADR-0002 still holds).

### Testing (Phase 1)

- Unit tests for every `fx.*` op against hand-computed 16.16 results, including overflow-wrap and multiply rounding edge cases.
- Property tests: `fx` arithmetic on values in 0–1 ranges stays within 1/65536 of the float result.
- Integration: a known-overflowing hash (`sin(p)*43758.5453`) produces *different* output under fidelity vs fast preview, proving the engine exposes the bug.
- The divergence harness runs against a real device out-of-band; its report is committed.

### Validation items (Phase 1) — confirmed

All resolved via the committed divergence harness against a real device (fw 3.67, 2026-05-29):

- ✅ Overflow **wraps** (int32), not saturates (#110).
- ✅ Multiply **truncates** after `>>16` (sign of the dividend); `frac` and `%` likewise truncate (#109, #114). Division also truncates on the device — a sub-ULP divergence vs the shim's rounding `fx.div`, for non-power-of-two divisors only.
- ✅ Bitwise ops integer-coerce their operands first; `~` zeros the low 16 bits (#110).
- ⚠️ Residual: hardware multiply drops low operand bits on fractional operands (#114), and the `× 1/65536` reinterpret literal flushes to raw 0 in the firmware parser (#111) — both documented and designed around (the integer hashes demote with `/ 256 / 256`, validated bit-identical, #113).

---

## Phase 2 — De-bug existing assets

The fidelity engine turns latent hardware bugs into visible preview bugs. Targets:

- **`Noise.js` hash rewrite.** `_hash1`/`_hash2` use constants like `374761393`, `0x27d4eb2d` — unrepresentable in 16.16 (>±32768) and reliant on JS 32-bit integer semantics that differ from PB's raw-fixed-point bitwise. They must be redesigned. This is a **genuine design task**, not a mechanical port:
  - Fidelity-critical, stable per-cell hashing (e.g. `voronoiID`, used by `Caustics`) → a **pure-integer hash** with representable constants relying on faithful int32 wrap, or `prngSeed(cellIndex)` + `prng()` where algorithmic divergence is acceptable.
  - Quality is constrained by 16.16; lower-entropy hashes are expected and acceptable for LED-scale visuals.
- **`PlasmaNebula` star hash.** Replace the inline `frac(sin(...)·43758.5453)` twinkle hash. Twinkle is cosmetic, so `prng`-based (accepting algorithmic divergence) is acceptable here.
- **Square-grid assumptions.** `Kishimisu` and `NeonSquircles` use `x*2-1` directly. Both now route through `Shader.toUV(x, y, aspect)` (#96). True non-square correctness (threading a real `aspect`) is **deferred to #116**: the preview normalises coords per-axis and exposes no `cols`/`rows` built-in, so `aspect` is hardcoded to `1` for now — an accepted square-grid limitation (honors the `2d-uv-convention` once #116 lands).
- **Sweep the other libraries.** `SDF.js`, `Coord.js`, `Color.js`, `Anim.js` operate in 0–1 ranges with small products and look hardware-safe; confirm under the fidelity engine and fix any surprises. **Done (#93):** all four swept — every function exercised in both fast and fidelity mode and asserted to agree (`{SDF,Coord,Color,Anim}.fidelity.test.ts`). No divergences found and no source changes needed: no `fx`-shadowing identifiers, no bit-shift/`|0` traps, no constants beyond ±32767. Confirmed hardware-safe.

---

## Phase 3 — `Shader` library + porting guide

### `Shader.js` design

A new read-only library under `src/pixelblaze/lib/`, namespace `Shader` (filename = namespace, consistent with `SDF`/`Coord`/etc.). It **fills GLSL gaps only** and leans on existing built-ins and libraries; it never re-implements a built-in.

**Out-var contract:** multi-output helpers write module-level globals (`Shader.ux`, `Shader.nx`, …) exactly as `Color.js`'s `lerpHSV`/`outH` does. **Read the outputs immediately, before the next helper call** — out-vars are shared temporaries.

#### Proposed function inventory (signatures)

Scalar gap-fillers (single return):

```js
Shader.fract(x)            // floor-based: x - floor(x)  — distinct from built-in frac()
Shader.step(edge, x)       // x < edge ? 0 : 1
Shader.sign(x)             // -1 / 0 / 1
Shader.saturate(x)         // clamp(x, 0, 1)
Shader.dot2(ax, ay, bx, by)
Shader.dot3(ax, ay, az, bx, by, bz)
Shader.distance2(ax, ay, bx, by)   // hypot(ax-bx, ay-by)
```

> `length` → use the built-in `hypot`/`hypot3`. `mix`, `smoothstep`, `clamp`, `mod` → built-ins, used directly. The guide's mapping table makes these substitutions explicit.

Multi-output helpers (out-vars):

```js
Shader.toUV(x, y, aspect)      // → Shader.ux, Shader.uy ;  ux=(x*2-1)*aspect, uy=(y*2-1)
                               //   aspect = cols/rows ; short axis = unit (matches /iResolution.y)
Shader.normalize2(x, y)        // → Shader.nx, Shader.ny  (+ Shader.len)
Shader.normalize3(x, y, z)     // → Shader.nx, Shader.ny, Shader.nz (+ Shader.len)
Shader.rot2(x, y, angle)       // → Shader.rx, Shader.ry  (2D rotation about origin; the mat2(rot) idiom)
Shader.reflect2(ix, iy, nx, ny)        // → Shader.rx, Shader.ry  (n assumed normalized)
Shader.reflect3(ix, iy, iz, nx, ny, nz)// → Shader.rx, Shader.ry, Shader.rz
```

Palette + hash (ShaderToy staples):

```js
// Inigo Quilez cosine palette: ch = a + b*cos(2π(c*t + d)), per channel → Shader.cr, cg, cb
Shader.iqPalette(t, ar,ag,ab, br,bg,bb, cr_,cg_,cb_, dr,dg,db)

// Hardware-safe pseudo-random in [0,1) from integer cell coords — pure integer arithmetic,
// NO sin/perlin, so it is bit-identical preview↔hardware once overflow is confirmed.
Shader.hash21(ix, iy)
Shader.hash11(n)
```

> The hash constants are **validated bit-identical preview↔hardware** via the divergence harness (fw 3.67, #103/#113). The final recipe demotes the wrapped int with `/ 256 / 256` (power-of-two, bit-exact) rather than a `× 1/65536` literal, which flushed to raw 0 on the device (#111).

#### What `Shader` deliberately omits

- Anything that's already a built-in (`mix`, `smoothstep`, `clamp`, `map`, `mod`, `hypot`, `abs`, `floor`, …).
- Array-based vector types (per-pixel allocation hazard).
- `iChannel`/texture sampling, feedback buffers, derivatives — non-portable, documented in the guide.

### Porting guide

Markdown in `docs/` (in-app surfacing deferred). Audience: *someone who found a ShaderToy shader they like and wants it on their LEDs* — can read GLSL, learning Pixelblaze's constraints. Structure:

1. **Workflow** — draft/verify in ShaderToy → flatten vectors → port → check in Fidelity preview → tune.
2. **Mapping reference** — table from GLSL constructs to Pixelblaze (`mix`/`step`/`fract`/`length`/`dot`/`mat2`/`iTime`/`iResolution`/`fragCoord`/`fragColor`), marking which are built-ins, which are `Shader.*`, and which need manual unrolling.
3. **Gotchas** — (a) **16.16 overflow** (the magic-constant-hash trap, with the fix); (b) **aspect/`iResolution`** (supply `aspect = cols/rows`); (c) **`fract` vs `frac`**; (d) **`iTime`** via `t += delta*0.001`; (e) loop/perf budget on the main thread.
4. **Worked example** — the cold port from Phase 4, start to finish.
5. **Won't port** — textures/`iChannel`, multipass feedback buffers, `dFdx`/`dFdy`/`fwidth`, `discard`, MRT — what they are, why they don't map, and "maybe later" notes (no detailed workarounds in v1).

---

## Phase 4 — Demo overhaul

- **Harden all five** shader-style demos under the fidelity engine: `Kishimisu`, `NeonSquircles`, `Caustics`, `PlasmaNebula`, `KaleidoBloom`.
- **Refactor the two explicit ports** (`Kishimisu`, `NeonSquircles`) onto `Shader.*` (`toUV`, `fract`, `iqPalette`, `rot2`, …).
- **One fresh cold port** of a classic ShaderToy shader done strictly by following the guide — the real end-to-end validation that the library + guide work, and the source of the guide's worked example. Gaps it surfaces feed back into `Shader.js`.
- Each demo is verified visually in the Precise renderer and, where it uses probeable built-ins, against the divergence harness.

---

## File / artifact layout

```
docs/
  prd/
    Feature — Hardware-Fidelity Preview & ShaderToy Porting.md   (this doc)
  adr/
    0001-... (superseded)   0003-fixed-point-fidelity-default.md
  guides/
    Porting ShaderToy shaders to Pixelblaze.md                    (Phase 3)
src/
  engine/
    fixedpoint.ts        (fx.* ops + raw int32 helpers)            (Phase 1)
    shim.ts              (+ fixed-point built-in wrappers)         (Phase 1)
    bundle.ts            (+ fixed-point emit mode)                 (Phase 1)
    loadPattern.ts       (+ fidelity/fast-preview selection)       (Phase 1)
  pixelblaze/
    lib/Shader.js        (Phase 3)
    lib/Noise.js         (rewritten hashes)                        (Phase 2)
    demos/*              (hardened + refactored + 1 new)           (Phase 4)
test/
  divergence-harness/    (dev tool + committed report)            (Phase 1)
```

---

## Risks & open questions

- ~~**Overflow semantics unconfirmed**~~ — **resolved**: hardware wraps (int32), confirmed via the harness (fw 3.67); multiply/`frac`/`%` truncate, bitwise ops integer-coerce. The fidelity contract and hash design held (#103/#110/#113).
- **Multiply performance** — the imul 64-bit path is the hot loop; if it's too slow even on small grids, fidelity-default may need reconsidering. Mitigation: benchmark in Phase 1 spike before committing.
- **Hash quality at 16.16** — pure-integer hashes constrained to representable constants may mix poorly; LED-scale visuals are forgiving, but some shaders may look grainier than on a GPU. Accepted.
- **Algorithmic divergence surprises** — patterns leaning on `perlin`/`prng` look right in preview but differ on hardware. Mitigation: the guide flags built-in noise as preview-approximate.

---

## Build order

1. **Phase 1 spike** — `fx.mul` correctness + benchmark; overflow validation via harness. Go/no-go on fidelity-default.
2. **Phase 1** — fixed-point engine, fixed-point shim, emit mode, fast-preview toggle + persistence, harness + report.
3. **Phase 2** — `Noise.js` hash rewrite, `PlasmaNebula` fix, aspect fixes, library sweep.
4. **Phase 3** — `Shader.js` (with tests), porting guide.
5. **Phase 4** — harden five demos, refactor two, cold-port one, fold gaps back into `Shader.js` and the guide.
```

---

## Appendix A — faithful 16.16 multiply (reference)

Goal: given raw int32 `a`, `b` (each = value×65536), compute `round((a·b) / 65536)` wrapped to int32, with the full 64-bit product (float64 is insufficient past 2⁵³).

Approach: split each operand into signed high / unsigned low 16-bit limbs, form the four partial products with `Math.imul`, assemble the 64-bit result across two 32-bit halves, arithmetic-shift right by 16, and wrap with `| 0`. Exact algorithm to be finalized and unit-tested in Phase 1 against hand-computed values; this appendix records the requirement (full 64-bit intermediate, arithmetic shift, int32 wrap), not the final code.
