// Divergence-harness probe pattern — HAND-LOAD THIS ONTO THE DEVICE.
//
// Phase 1 of the Hardware Connectivity feature deliberately avoids the
// undocumented binary pattern-push protocol, so this pattern is loaded ONCE, by
// hand, via the stock ElectroMage editor (paste it in, hit save). The harness
// then drives it entirely through the documented getVars/setVars API:
//
//   1. harness setVars({ fn, a, b })   — choose the built-in and its inputs
//   2. device beforeRender computes     probe = f(a, b)   (16.16 fixed-point)
//   3. harness getVars()               — reads `probe` back as a float
//
// `probe` is the device's fixed-point result reinterpreted as a float in the
// vars JSON, so comparing it to the preview's value characterises the firmware's
// fixed-point behaviour (rounding, overflow, negative-edge handling, hashes).
//
// The `fn` codes MUST stay in sync with FN in builtins-spec.ts.

export var fn = 0   // which built-in to evaluate (see FN map in builtins-spec.ts)
export var a = 0    // primary input
export var b = 0    // secondary input (mod / multiply / hash21 / add)
export var probe = 0 // result, read back by the harness

// Integer hashes under test — copied verbatim from src/pixelblaze/lib so the
// device runs the exact same source the fidelity rewrite committed. Bit-identity
// here is the whole point: these rely on faithful int32 wrap of the raw value.
function hash11(n) {
  var h = n * 1619 + 1013
  h = h * (h + 197)
  h = h * 769
  var f = h * 0.0000152587890625 // × 1/65536
  return f - floor(f)
}
function hash21(ix, iy) {
  var h = ix * 1619 + iy * 31337 + 1013
  h = h * (h + 197)
  h = h * 769
  var f = h * 0.0000152587890625 // × 1/65536
  return f - floor(f)
}

// ── #111 discriminators: localise WHERE hash11 collapses to 0 on hardware ─────
// Each stage ends with the same reinterpret-and-fract tail as hash11, so its
// output lands in [0,1) and survives getVars readback (which saturates values
// outside ±32767). Comparing each stage device-vs-fx narrows the root cause:
//   - reint     : does the tiny ×1/65536 constant survive a multiply at all?
//   - hash11_s1 : stage 1 only (no overflow yet) — isolates the reinterpret/floor
//   - hash11_s2 : through the first overflowing multiply h*(h+197)
// If reint is 0 → constant underflowed to 0. If s1 is 0 but reint isn't →
// floor/reinterpret on a wrapped value. If s1 matches but s2/full is 0 → the
// overflow multiply, not the tail, is the culprit.
function reint(n) {
  return n * 0.0000152587890625
}
function hash11_s1(n) {
  var h = n * 1619 + 1013
  var f = h * 0.0000152587890625
  return f - floor(f)
}
function hash11_s2(n) {
  var h = n * 1619 + 1013
  h = h * (h + 197)
  var f = h * 0.0000152587890625
  return f - floor(f)
}

function compute() {
  if (fn == 0)  return sin(a)
  if (fn == 1)  return cos(a)
  if (fn == 2)  return tan(a)
  if (fn == 3)  return abs(a)
  if (fn == 4)  return sqrt(a)
  if (fn == 5)  return floor(a)
  if (fn == 6)  return ceil(a)
  if (fn == 7)  return frac(a)
  if (fn == 8)  return a % b          // mod — negative-edge behaviour
  if (fn == 9)  return a * b          // multiply — rounding mode after >>16
  if (fn == 10) return ~a             // bitwise NOT — negative-edge behaviour
  if (fn == 11) return a + b          // add — overflow wrap vs saturate
  if (fn == 12) return hash11(a)      // candidate integer hash (1 input)
  if (fn == 13) return hash21(a, b)   // candidate integer hash (2 inputs)
  if (fn == 14) return exp(a)
  if (fn == 15) return log(a)
  if (fn == 16) return pow(a, b)
  if (fn == 17) return reint(a)        // #111: does ×1/65536 survive a multiply?
  if (fn == 18) return hash11_s1(a)    // #111: hash11 stage 1 (pre-overflow)
  if (fn == 19) return hash11_s2(a)    // #111: hash11 through first overflow mul
  return 0
}

// beforeRender runs every frame regardless of pixel count, so the harness can
// set inputs, wait a frame, and read `probe` without depending on a sentinel
// pixel index. (The PRD sketches an `if (index == PROBE)` variant; beforeRender
// is the same documented API but robust to map size — noted in the report.)
export function beforeRender(delta) {
  probe = compute()
}

// Minimal render so the pattern is valid and visibly "alive" on the device.
export function render(index) {
  hsv(0, 0, 0.02)
}
