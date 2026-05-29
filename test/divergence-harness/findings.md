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

- **`hash11` / `hash21` return exactly 0 on hardware.** The `fn` 17–19
  discriminators (live run 2026-05-29, fw 3.67) pin it precisely:

  - **`reint` (`a * 1/65536`) = 0 for every input** (a=4 → device `0`, ref
    `0.000061`). This is the smoking gun.
  - `hash11_s1` and `hash11_s2` are *also* 0 — because both end in the same
    `* (1/65536)` reinterpret step. The overflow multiplies are **not** the
    culprit.

  **Root cause: the device's 16.16 multiply truncates the low bits of each
  operand before multiplying** (classic embedded `(a>>8)*(b>>8)`-style mul, not
  an exact 64-bit product). Multiplying by the reinterpret constant — raw int
  `1` (= 1/65536) — zeroes that operand, so the product is 0. The whole
  `× 1/65536` "reinterpret the wrapped int's bits as a fraction" trick is
  therefore **unsound on hardware**.

  This also resolves two earlier loose ends:
  - It explains the "mul → truncate" behaviour answer (low operand bits are
    dropped, not rounded).
  - It explains why "multiply matches `fx`" looked true before: that was only
    ever checked on **integer-valued** operands (raw low bits = 0) — the one
    case where the device's lossy mul and `fx`'s exact mul agree. `fx.mul` is
    NOT bit-identical to hardware for operands carrying fractional precision.

  **Consequences / follow-ups:**
  - The bit-identity claim in **ADR-0003** cannot hold for the reinterpret-based
    hash recipe. `Noise.js` `_hash1`/`_hash2` and `Shader.js` `hash11`/`hash21`
    need a redesign that never relies on multiplying by a sub-256-raw constant
    (e.g. read the integer part via `floor`/division rather than the multiply
    reinterpret), then re-probe.
  - `fx.mul` fidelity itself is now in question for fractional operands — worth a
    dedicated probe sweep to characterise exactly how many low bits the device
    drops, so `fx.mul` can match (or the divergence be documented).

## Transport note (not a contradiction)

- **`setVars` saturates out-of-range inputs** to ±32767 before storing them as
  16.16. The harness keeps swept inputs within range; future probes must too.
  (Once floated as a candidate for the hash anomaly — ruled out: the real cause
  is the lossy device multiply, see #111 above.)
