// Shader — GLSL/ShaderToy gap-fillers for porting shaders to Pixelblaze
//
// This library fills the gaps GLSL has that Pixelblaze's built-ins do NOT
// already cover. It deliberately never re-implements a built-in:
//
//   GLSL            → use the Pixelblaze built-in directly (do NOT call Shader.*)
//   mix             → mix(low, high, weight)
//   smoothstep      → smoothstep(low, high, v)
//   clamp           → clamp(value, low, hi)
//   mod             → mod(x, y)            (floored, GLSL-matching)
//   length(v)       → hypot(x, y) / hypot3(x, y, z)
//   abs/floor/...    → abs/floor/min/max/pow/sqrt/...
//
// Assumes built-ins: floor, clamp, hypot, cos, sin, exp, PI2.
//
// ── Out-var contract ─────────────────────────────────────────────────────────
// Multi-output helpers cannot return a vector (no arrays — per-pixel allocation
// hazard), so they write module-level globals (Shader.ux, Shader.nx, …) exactly
// as Color.js's lerpHSV writes outH/outS/outV. These are SHARED TEMPORARIES:
// read them immediately, before the next Shader helper call overwrites them.

// ─── Scalar gap-fillers ────────────────────────────────────────────────────────

// GLSL fract: x - floor(x), always in [0, 1). Distinct from the built-in frac(),
// which is truncate-based and returns negatives for negative inputs — that
// breaks symmetric folds like fract(uv) - 0.5. Use Shader.fract for ports.
function fract(x) { return x - floor(x); }

// GLSL step: 0 below the edge, 1 at or above it
function step(edge, x) { return x < edge ? 0 : 1; }

// GLSL sign: -1 / 0 / 1
function sign(x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); }

// GLSL saturate / HLSL clamp-to-unit: clamp(x, 0, 1)
function saturate(x) { return clamp(x, 0, 1); }

// GLSL tanh — not a Pixelblaze built-in. The textbook form (e^2x-1)/(e^2x+1)
// overflows the 16.16 range once e^2x passes ±32768 (|x| ≳ 5.2), so clamp to ±5
// first; tanh has already saturated to ±0.9999 there, so the clamp is invisible.
// This bakes in the guard ShaderToy authors hand-roll as "stanh" to kill the
// black-artifact overflow, so ports can call Shader.tanh directly.
function tanh(x) {
  var e = exp(2 * clamp(x, -5, 5));
  return (e - 1) / (e + 1);
}

// 2D dot product
function dot2(ax, ay, bx, by) { return ax * bx + ay * by; }

// 3D dot product
function dot3(ax, ay, az, bx, by, bz) { return ax * bx + ay * by + az * bz; }

// Euclidean distance between two 2D points (built-in hypot does length())
function distance2(ax, ay, bx, by) { return hypot(ax - bx, ay - by); }

// ─── Out-var helpers ───────────────────────────────────────────────────────────

// UV mapping: centred GLSL-style coords. aspect = cols/rows; the short axis
// spans the unit (matches dividing fragCoord by iResolution.y) so non-square
// grids stay correctly proportioned (honours the 2D uv convention).
// Writes: ux, uy.
var ux = 0, uy = 0;
function toUV(x, y, aspect) {
  ux = (x * 2 - 1) * aspect;
  uy = y * 2 - 1;
}

// Normalize a 2D vector. Writes: nx, ny, len (the original length).
// len == 0 yields nx = ny = 0 (GLSL normalize(0) is undefined; this is safe).
var nx = 0, ny = 0, nz = 0, len = 0;
function normalize2(x, y) {
  len = hypot(x, y);
  if (len == 0) { nx = 0; ny = 0; }
  else { nx = x / len; ny = y / len; }
}

// Normalize a 3D vector. Writes: nx, ny, nz, len (the original length).
function normalize3(x, y, z) {
  len = hypot3(x, y, z);
  if (len == 0) { nx = 0; ny = 0; nz = 0; }
  else { nx = x / len; ny = y / len; nz = z / len; }
}

// 2D rotation about the origin (the GLSL mat2(rot(angle)) idiom).
// Writes: rx, ry.
var rx = 0, ry = 0, rz = 0;
function rot2(x, y, angle) {
  var c = cos(angle), s = sin(angle);
  rx = x * c - y * s;
  ry = x * s + y * c;
}

// GLSL reflect for 2D: i - 2*dot(i, n)*n. n is assumed normalized.
// Writes: rx, ry.
function reflect2(ix, iy, nx_, ny_) {
  var d = 2 * (ix * nx_ + iy * ny_);
  rx = ix - d * nx_;
  ry = iy - d * ny_;
}

// GLSL reflect for 3D: i - 2*dot(i, n)*n. n is assumed normalized.
// Writes: rx, ry, rz.
function reflect3(ix, iy, iz, nx_, ny_, nz_) {
  var d = 2 * (ix * nx_ + iy * ny_ + iz * nz_);
  rx = ix - d * nx_;
  ry = iy - d * ny_;
  rz = iz - d * nz_;
}

// ─── Palette ─────────────────────────────────────────────────────────────────

// Inigo Quilez cosine palette: ch = a + b*cos(2π*(c*t + d)), per channel.
// The ShaderToy staple for procedural gradients. Writes: cr, cg, cb.
var cr = 0, cg = 0, cb = 0;
function iqPalette(t, ar, ag, ab, br, bg, bb, cr_, cg_, cb_, dr, dg, db) {
  cr = ar + br * cos(PI2 * (cr_ * t + dr));
  cg = ag + bg * cos(PI2 * (cg_ * t + dg));
  cb = ab + bb * cos(PI2 * (cb_ * t + db));
}

// ─── Integer hashes ────────────────────────────────────────────────────────────
//
// Hardware-safe pseudo-random in [0, 1) from integer cell coords. Pure
// multiply/add only — NO sin/perlin/prng (those are algorithmically divergent
// between preview and hardware, ADR-0003). Built to the same 16.16-fidelity
// recipe as Noise.js's _hash2/_hash1 (#92):
//
//   - constants ≤ ±32767 (larger ones overflow when scaled by 65536 into raw
//     int32 under the fixed-point engine),
//   - no bit-shifts (a `>> 13` becomes `>> (13<<16)` ≡ `>> 0` under emit),
//   - no `~` (zeros the low 16 bits on hardware) and no `| 0` (a no-op under
//     fidelity; use floor()),
//   - the final `/ 256 / 256` demotes the wrapped int32's low 16 bits into a
//     [0, 1) fraction, then floor-based fract folds it into a stable [0, 1).
//     Both divisors are powers of two ≤ the 16 fractional bits, so the divide
//     is bit-exact regardless of the device's round/truncate mode.
//
// NOT `* (1/65536)`: that literal flushes to raw 0 in the firmware's number
// parser and collapsed every hash to 0 on the device (#111). Power-of-two
// division avoids the sub-ULP literal.
//
// VALIDATED bit-identical preview↔hardware via the divergence harness against a
// real Pixelblaze (fw 3.67, 2026-05-29): `hash11_div` matched the fixed-point
// reference to sub-ULP across the swept inputs (#113). ADR-0003.

// Hash 2 integer cell coords → [0, 1)
function hash21(ix, iy) {
  var h = ix * 1619 + iy * 31337 + 1013;
  h = h * (h + 197);
  h = h * 769;
  var f = h / 256 / 256; // demote wrapped low bits — power-of-two divide is bit-exact (#113)
  return f - floor(f);
}

// Hash 1 integer value → [0, 1)
function hash11(n) {
  var h = n * 1619 + 1013;
  h = h * (h + 197);
  h = h * 769;
  var f = h / 256 / 256; // demote wrapped low bits — power-of-two divide is bit-exact (#113)
  return f - floor(f);
}
