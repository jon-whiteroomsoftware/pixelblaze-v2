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

## Anomaly for the fidelity work

- **`hash11` / `hash21` return exactly 0 on hardware** while the fixed-point
  reference returns nonzero, well-distributed values. This is *not* a
  multiply-overflow divergence (multiply matches `fx`). Root cause still
  unknown — needs a device run. → **#111 OPEN.**

  **Discriminator probes added** (`fn` 17–19, awaiting the next hardware run):
  - `reint` (17): `a * (1/65536)` alone — if the device returns 0 here, the tiny
    reinterpret constant underflowed to 0 (smoking gun).
  - `hash11_s1` (18): hash11 stage 1 only (no overflow yet) — isolates the
    reinterpret/floor tail from the overflow multiplies.
  - `hash11_s2` (19): through the first overflowing multiply `h*(h+197)`.

  Where the chain first hits 0 pins the cause: `reint`=0 → constant; `s1`=0 but
  `reint`≠0 → floor/reinterpret on a wrapped value; `s1` matches but `s2`/full=0
  → the overflow multiply (despite the single-case match in `report.md`). All
  three carry an `fx` reference; each ends in the reinterpret-and-fract tail so
  output stays inside [0,1) and survives the ±32767 `getVars` readback clamp.

## Transport note (not a contradiction)

- **`setVars` saturates out-of-range inputs** to ±32767 before storing them as
  16.16. The harness keeps swept inputs within range; future probes must too.
  This is also a candidate root cause for the hash anomaly (see #111).
