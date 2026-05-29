---
status: accepted (supersedes ADR-0001)
---

# Browser preview defaults to faithful 16.16 fixed-point, with a float64 escape hatch

ADR-0001 chose to run the preview as native float64 with no fixed-point emulation, accepting the resulting hardware divergence. We are reversing that: the preview will **default to faithful 16.16 fixed-point emulation** so that what the preview shows matches what a physical Pixelblaze does, with a per-pattern **fast-preview** toggle that drops back to float64 for heavy patterns whose fidelity render is too slow to edit against.

The reversal is driven by the ShaderToy/GLSL porting work (see `docs/prd/Feature — Hardware-Fidelity Preview & ShaderToy Porting.md`): porting is only valuable if a pattern that looks right in the preview actually runs on hardware, and the most common GLSL idioms (large-constant hashes such as `fract(sin(p·12.9898)·43758.5453)`) silently overflow 16.16 on hardware while looking perfect in float64. A float64-only preview cannot reveal that class of bug, which defeats the porting goal.

## How (summary; full design in the feature PRD)

- Every pattern number is represented as its **raw int32** (value × 65536). Add/sub/compare/bitwise use native ops with `| 0` for int32-wrap; multiply uses a `Math.imul`-based exact 64-bit product shifted right 16; divide uses a sub-2⁵³ float intermediate. This is bit-faithful for arithmetic and overflow.
- **Transcendentals** (`sin`, `cos`, `sqrt`, `pow`, …) are computed in float64 and quantized to 16.16 behind an `fx.*` seam — a small, documented precision divergence, upgradable to firmware-matched LUTs only if a hardware divergence harness shows a visible difference.
- **Built-in algorithm identity** (`perlin`, `prng`, `wave`) is explicitly *not* matched bit-for-bit; the shim's implementations are different algorithms than firmware and remain documented "preview-approximate." Fidelity covers the numeric domain, not firmware internals.
- The fixed-point transform is a **preview-only second emit mode** off the existing Acorn AST. The downloaded/copied hardware artifact is unchanged plain code — the hardware does fixed-point natively.

## Considered alternatives

- **Keep float64 only (ADR-0001).** Rejected: cannot surface overflow/precision bugs, so ported patterns can pass preview and fail on hardware.
- **Float64 default + opt-in "verify" mode.** Rejected: makes hardware truth opt-in and easy to forget; the project's goal is WYSIWYG-on-hardware, so truth should be the default.
- **Lint-only (detect overflow, don't reproduce it).** Rejected: warns but doesn't show the actual hardware image, so the designer still can't trust the preview.
- **Bit-exact everything incl. firmware perlin/prng/LUTs.** Deferred: high effort, partially blocked by closed-source firmware, and unnecessary for the numeric bugs that actually break ports.

## Consequences

- Heavy patterns (deep raymarch loops, large grids) run ~3–8× slower under fidelity and may drop below interactive frame rates — mitigated by the per-pattern fast-preview escape hatch, persisted with the pattern.
- The transpiler/runtime gains a fixed-point emit path and a parallel fixed-point built-in seam; more engine surface and test burden.
- Two divergence classes remain and are documented rather than eliminated: transcendental precision (small) and built-in algorithm identity (`perlin`/`prng`).
- Open empirical items, to confirm against a real device: exact overflow behaviour (assumed int32 **wrap**, not saturate) and the multiply rounding mode. **Confirmed (divergence harness, fw 3.67, 2026-05-29):** overflow **wraps**; multiply, frac and `%` all **truncate** (sign of the dividend); bitwise ops integer-coerce operands first. Division also **truncates** on the device (the shim's `fx.div` rounds — a sub-ULP divergence for non-power-of-two divisors only; power-of-two divides are exact either way).
- The fidelity integer hashes (`Noise.js` `_hash1`/`_hash2`, `Shader.js` `hash11`/`hash21`) are harness-validated **bit-identical preview↔hardware** (#113). They demote the wrapped integer with `/ 256 / 256` (power-of-two, bit-exact) rather than a `× 1/65536` literal, which flushed to raw 0 in the firmware's number parser and collapsed every hash to 0 (#111). The general bit-identity claim above therefore holds for the hash recipe.
