---
status: superseded by ADR-0003
---

# Browser preview runs patterns as native float64, not emulated 16.16 fixed-point

> **Superseded by [ADR-0003](0003-fixed-point-fidelity-default.md).** The preview now defaults to faithful 16.16 fixed-point emulation (with a float64 "fast preview" escape hatch), because float64-only could not surface the overflow/precision bugs that break GLSL/ShaderToy ports on hardware. The reasoning below is retained for historical context.

Pixelblaze hardware represents all numbers as 16.16 fixed-point (range ±32,768, precision 1/65,536) and its bitwise operators act across the full 32 bits including the fractional half — semantics that differ from JavaScript. We decided the browser preview will execute patterns using native JS float64 with no fixed-point emulation.

The preview's purpose is "close enough to design by," not bit-exact hardware simulation. Emulating fixed-point would require wrapping every arithmetic and bitwise operation in the transpiled output (turning the transpiler from a function-inliner into a full math rewriter) and would hurt render-loop performance, for negligible visual gain on typical patterns that work in 0–1 ranges.

## Consequences

- Patterns relying on bitwise tricks, deliberate overflow/saturation at ±32,768, or 1/65,536 quantization will look different in-browser than on real hardware.
- This is an accepted, documented divergence. Hardware upload is deferred from v1, so the gap has no immediate user-facing impact.
