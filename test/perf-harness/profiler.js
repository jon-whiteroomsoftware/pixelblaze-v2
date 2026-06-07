// Perf-harness profiler pattern — HAND-LOAD THIS ONTO THE DEVICE (#245).
//
// Mirrors the divergence harness: load this ONCE by hand via the stock
// ElectroMage editor (paste, save, leave active), then drive it from Node over
// the documented getVars/setVars API. It measures the *relative cost of native
// Pixelblaze built-ins on real hardware* — the one thing the float64 emulator
// can't tell us (every built-in is a Math.* call there).
//
// How it works:
//   1. runner setVars({ fn, iters })  — pick the op + inner-loop count
//   2. device beforeRender(delta) runs op `iters` times in a tight loop and
//      folds an EMA of the frame time into `ms`
//   3. runner getVars() reads `ms` back once the EMA has settled
//
// Net per-op cost = ms(fn) - ms(baseline), divided by iters, normalized to a
// multiply. The baseline (fn=0) is the SAME loop+dispatch+wrap with an identity
// op, so subtracting it nets out everything except the op itself.
//
// Anti-cheat (so the bytecode VM can't optimise the loop away):
//   - the op's argument is the running accumulator `x` (not a constant), so no
//     call can be hoisted out of the loop;
//   - `x` feeds forward each iteration and `acc` carries across frames into a
//     read-back sink, so the loop is not dead code;
//   - every iteration wraps through `frac(... + 0.123)` to keep operands in
//     [0,1) — bounded, so 16.16 overflow doesn't change costs frame to frame.
//
// The `fn` codes MUST stay in sync with OPS in profiler.ts.

export var fn = 0      // which built-in to profile (see OPS in profiler.ts)
export var iters = 200 // inner-loop count, auto-tuned by the runner
export var ms = 0      // EMA of frame time (ms), read back by the runner
export var acc = 0     // cross-frame accumulator / sink (keeps the loop live)

// Dispatch is HOISTED OUT of the inner loop: each op gets its own tight loop,
// selected once per frame. Two earlier designs failed:
//   1. an if-chain with early `return` inside the loop — dispatch cost grew with
//      the op's POSITION (a higher fn ran more comparisons per iter), so cost
//      climbed in list order and add/sub looked pricier than mul;
//   2. a full no-early-return chain inside the loop — constant but EXPENSIVE, so
//      the 30 comparisons/iter dominated the frame, the watchdog forced `iters`
//      down to ~500, and the real op signal sank into timing noise (perlin-
//      Turbulence measured cheaper than perlin — impossible).
// Hoisting fixes both: the 30 comparisons run ONCE per frame (negligible), each
// op's inner loop is just `op + frac` wrap, so `iters` can go high (good SNR)
// and baseline subtraction cancels the identical loop+frac overhead exactly.
//
// Every loop body is `frac(<expr> + 0.123)`: bounded in [0,1) (no 16.16 overflow
// drift), x feeds forward (no hoisting), acc carries across frames (not dead
// code). Operand expressions match the op being measured; baseline is identity.
export function beforeRender(delta) {
  // EMA of frame time. alpha=0.05 → ~20-frame memory; the runner settles long
  // enough for this to converge before reading.
  ms = ms + (delta - ms) * 0.05

  var x = acc
  var f = fn
  var n = iters
  var i = 0

  if (f == 0)  for (i = 0; i < n; i++) x = frac(x + 0.123)              // baseline — identity (loop overhead only)
  if (f == 1)  for (i = 0; i < n; i++) x = frac(x * 1.0001 + 0.123)     // multiply — the normalization unit
  if (f == 2)  for (i = 0; i < n; i++) x = frac(x + 1.0001 + 0.123)     // add
  if (f == 3)  for (i = 0; i < n; i++) x = frac(x - 1.0001 + 0.123)     // subtract
  if (f == 4)  for (i = 0; i < n; i++) x = frac(x / 1.0001 + 0.123)     // divide
  if (f == 5)  for (i = 0; i < n; i++) x = frac(x % 0.37 + 0.123)       // mod
  if (f == 6)  for (i = 0; i < n; i++) x = frac(abs(x - 0.5) + 0.123)   // abs
  if (f == 7)  for (i = 0; i < n; i++) x = frac(floor(x * 8) + 0.123)   // floor
  if (f == 8)  for (i = 0; i < n; i++) x = frac(ceil(x * 8) + 0.123)    // ceil
  if (f == 9)  for (i = 0; i < n; i++) x = frac(frac(x * 8) + 0.123)    // frac
  if (f == 10) for (i = 0; i < n; i++) x = frac(sin(x * 6.283) + 0.123) // sin
  if (f == 11) for (i = 0; i < n; i++) x = frac(cos(x * 6.283) + 0.123) // cos
  if (f == 12) for (i = 0; i < n; i++) x = frac(tan(x * 1.5) + 0.123)   // tan
  if (f == 13) for (i = 0; i < n; i++) x = frac(wave(x) + 0.123)        // wave — table lookup (should be cheap)
  if (f == 14) for (i = 0; i < n; i++) x = frac(triangle(x) + 0.123)    // triangle
  if (f == 15) for (i = 0; i < n; i++) x = frac(square(x, 0.5) + 0.123) // square (duty 0.5)
  if (f == 16) for (i = 0; i < n; i++) x = frac(sqrt(x + 0.001) + 0.123) // sqrt
  if (f == 17) for (i = 0; i < n; i++) x = frac(pow(x + 0.001, 2.3) + 0.123) // pow
  if (f == 18) for (i = 0; i < n; i++) x = frac(exp(x) + 0.123)         // exp
  if (f == 19) for (i = 0; i < n; i++) x = frac(log(x + 0.001) + 0.123) // log
  if (f == 20) for (i = 0; i < n; i++) x = frac(hypot(x, 0.5) + 0.123)  // hypot
  if (f == 21) for (i = 0; i < n; i++) x = frac(atan2(x, 0.5) + 0.123)  // atan2
  if (f == 22) for (i = 0; i < n; i++) x = frac(atan(x) + 0.123)        // atan
  if (f == 23) for (i = 0; i < n; i++) x = frac(asin(x) + 0.123)        // asin
  if (f == 24) for (i = 0; i < n; i++) x = frac(acos(x) + 0.123)        // acos
  if (f == 25) for (i = 0; i < n; i++) x = frac(clamp(x, 0.1, 0.9) + 0.123) // clamp
  if (f == 26) for (i = 0; i < n; i++) x = frac(min(x, 0.5) + 0.123)    // min
  if (f == 27) for (i = 0; i < n; i++) x = frac(max(x, 0.5) + 0.123)    // max
  if (f == 28) for (i = 0; i < n; i++) x = frac(perlin(x, 0.5, 0.25, 0) + 0.123) // perlin (3D + seed)
  if (f == 29) for (i = 0; i < n; i++) x = frac(perlinTurbulence(x, 0.5, 0.25, 0, 2, 0.5) + 0.123) // perlinTurbulence
  if (f == 30) for (i = 0; i < n; i++) x = frac(perlinRidge(x, 0.5, 0.25, 0, 2, 0.5, 1.0) + 0.123) // perlinRidge

  acc = x                        // carry across frames so nothing is dead code
}

// Minimal render so the pattern is valid and faintly alive on the device. Kept
// trivial on purpose — we measure op cost in beforeRender, isolated from the
// per-pixel map/LED-output path.
export function render(index) {
  hsv(0, 0, 0.02)
}
