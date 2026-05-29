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

- **`mod`** — `fx.mod` is *floored* (sign of divisor); hardware `%` is
  *truncated* (sign of dividend, identical to JS `%`). → **#109**
- **Bitwise `~`** — `fx` bitwise ops keep the raw 16.16 fraction; hardware
  coerces the operand to its integer part first (`~2.5` → −3). Likely applies to
  all bitwise/shift operators. → **#110**

## Anomaly for the fidelity work

- **`hash11` / `hash21` return exactly 0 on hardware** while the fixed-point
  reference returns nonzero, well-distributed values. This is *not* a
  multiply-overflow divergence (multiply matches `fx`). Root cause unknown.
  → **#111**

## Transport note (not a contradiction)

- **`setVars` saturates out-of-range inputs** to ±32767 before storing them as
  16.16. The harness keeps swept inputs within range; future probes must too.
  This is also a candidate root cause for the hash anomaly (see #111).
