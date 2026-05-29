# Divergence harness — findings & follow-ups

Hand-written interpretation of the live run captured in [`report.md`](./report.md)
(auto-generated; do not edit by hand). Device: Pixelblaze `192.168.8.224`,
firmware 3.67, 2026-05-29.

## What matched (no action)

- **Transcendentals** diverge from ideal float64 only as expected for 16.16
  (sin/cos ~400 ULP, tan ~700 ULP, sqrt ~1 ULP). These are the divergence
  numbers the fidelity feature consumes.
- **Add overflow → wraps** (mod 2¹⁶ on the integer part); matches `fx`.
- **Multiply → truncates the dropped bits and wraps on overflow**; matches
  `fx.mul` exactly, including large-operand cases
  (e.g. 1619·1013 = 1640047 → 1647 = 1640047 mod 65536 on both).
- **`frac` → truncate-based** (sign follows the operand); matches `fx.frac`.

## Contradictions of `fixedpoint.ts` / shim assumptions (follow-ups filed)

- **`mod`** — `fx.mod` was *floored* (sign of divisor); hardware `%` is
  *truncated* (sign of dividend, identical to JS `%`). → **#109 FIXED**:
  `fx.mod` is now `(a % b) | 0`.
- **Bitwise `~`** — `fx` bitwise ops kept the raw 16.16 fraction; hardware
  coerces the operand to its integer part first (`~2.5` → −3). → **#110 FIXED**:
  all of `&`/`|`/`^`/`~`/`<<`/`>>` now integer-coerce operands (`raw >> 16`),
  operate, then re-scale (`<< 16`). Coercing shift counts also cancels the
  fixed-point shift-count-scaling trap as a side effect.

## Anomaly for the fidelity work — ROOT CAUSE FOUND (#111)

- **`hash11` / `hash21` return exactly 0 on hardware.** Pinned over two live
  runs (2026-05-29, fw 3.67) with the `fn` 17–20 discriminators:

  - **`reint` (`a * 1/65536`) = 0 for every input** (a=4 → device `0`, ref
    `0.000061`).
  - `hash11_s1` / `hash11_s2` are *also* 0 — both end in the same
    `* (1/65536)` reinterpret step.
  - `mul-precision` (multiply with a *non-tiny* fractional operand, b=1/3):
    device matches exact `fx.mul` to **~1 ULP**. So the device multiply is
    full-precision truncate — it does **not** drop operand bits.
  - **`small-const` → `flushes to 0`**: the literal `0.0000152587890625`
    (= 1/65536, the smallest 16.16 ULP) compiles to raw **0** on the device.

  **Root cause: the `1/65536` literal flushes to 0 in the firmware's literal
  parser.** `h * 0` is 0 for all `h`, so every hash that ends in the
  `× 1/65536` reinterpret returns 0. The multiply is innocent; the constant is
  the problem.

  > Correction: an earlier draft of this note blamed a "lossy `(a>>8)*(b>>8)`
  > multiply." The `mul-precision` probe **disproved** that (~1 ULP agreement).
  > The "mul → truncate" answer is ordinary result truncation, not operand-bit
  > loss, and `fx.mul` is fine.

  **Consequences / follow-ups:**
  - The bit-identity claim in **ADR-0003** can't hold for the reinterpret-based
    hash recipe while it depends on a sub-ULP literal. `Noise.js` `_hash1`/
    `_hash2` and `Shader.js` `hash11`/`hash21` need a redesign that never relies
    on a `1/65536`-scale literal (e.g. use `floor`/division or a larger-constant
    fold), then re-probe. → **#113 FIXED** (below).
  - `fx.mul` fidelity is **not** a concern after all (device ~1 ULP on
    fractional operands). → **#114 closed: not reproduced.**

## #113 RESOLVED — power-of-two division demotion is bit-exact

The dead `h * (1/65536)` tail is replaced by `h / 256 / 256`. Re-probed live
(2026-05-29, fw 3.67):

- **`hash11_div` (the `/256/256` recipe) matched the fixed-point reference to
  max |Δ| = 5.3e-7** — sub-ULP (1 ULP = 1.5e-5), i.e. bit-identical, and
  crucially **non-zero** for every input.
- **`div-rounding` → truncate**: the device truncates 16.16 division (`2/3`
  read back 1 ULP below the rounded value).

Why truncation doesn't bite: at the tail `h` is **integer-valued**
(raw = `h_int << 16`). Dividing by 256 is a power-of-two shift that lands
exactly on a raw boundary — `h/256` → raw `(h_int mod 65536) << 8`, `/256`
again → raw `(h_int mod 65536)`, both with **zero remainder**. With nothing to
round, truncate-vs-round is moot, so the demotion is bit-exact. (256 is also
well within ±32767 and the intermediate never overflows the 32-bit raw — the
two failure modes that killed `×1/256×1/256` and `/65536`.)

→ **ADR-0003's bit-identity claim stands**; `Noise.js`/`Shader.js` tails and
comments updated to cite the power-of-two divide instead of the `1/65536`
literal. The `hash11_div` / `div-rounding` probes are kept as regression
evidence.

## Transport note (not a contradiction)

- **`setVars` saturates out-of-range inputs** to ±32767 before storing them as
  16.16. The harness keeps swept inputs within range; future probes must too.
  (Once floated as a candidate for the hash anomaly — ruled out: the real cause
  is the lossy device multiply, see #111 above.)
