// Noise — noise, randomness, and organic variation
//
// All functions are pure scalar — no arrays, no dynamic allocation.
// Assumes: sin, cos, sqrt, abs, floor, min, max, clamp, PI

// ─── Integer hashes ──────────────────────────────────────────────────────────
//
// Designed for 16.16 fixed-point fidelity. The original hashes used constants
// like 374761393 and 0x27d4eb2d (far beyond ±32768, unrepresentable in 16.16)
// and bit-shifts whose shift counts get scaled by 65536 under fixed-point emit
// (a `>> 13` becomes `>> (13<<16)` ≡ `>> 0`) — both meaningless on hardware.
//
// These use only multiply / add with constants ≤ 32767, relying on faithful
// int32 wrap of the raw fixed-point value (hardware does the same), so they are
// bit-identical preview↔hardware under the fidelity engine. The integer part
// wraps mod 65536, giving a ~16-bit hash — lower entropy than a 32-bit hash,
// but ample for LED-scale visuals (ADR-0003).
//
// The final step `h / 256 / 256` demotes the wrapped integer's low 16 bits into
// a [0, 1) fraction; the floor-based fract then folds it into a stable [0, 1).
// Both divisors are powers of two ≤ the 16 fractional bits, so the divide is
// bit-exact on hardware regardless of its round/truncate mode (confirmed: the
// device truncates division, yet `hash11_div` matched the fixed-point reference
// to sub-ULP — divergence harness, fw 3.67, #113).
//
// NOT `h * (1/65536)`: the literal 0.0000152587890625 flushes to raw 0 in the
// firmware's number parser, so `h * 0 = 0` collapsed every hash to 0 on the
// device (#111). Power-of-two division avoids any sub-ULP literal entirely.
// No `sin`/`perlin` — those are algorithmically divergent (ADR-0003) and unfit
// for fidelity-critical hashing.

function _hash2(ix, iy) {
  var h = ix * 1619 + iy * 31337 + 1013;
  h = h * (h + 197);
  h = h * 769;
  var f = h / 256 / 256; // demote wrapped low bits — power-of-two divide is bit-exact (#113)
  return f - floor(f);
}

function _hash1(n) {
  var h = n * 1619 + 1013;
  h = h * (h + 197);
  h = h * 769;
  var f = h / 256 / 256; // demote wrapped low bits — power-of-two divide is bit-exact (#113)
  return f - floor(f);
}

// ─── Value noise ─────────────────────────────────────────────────────────────

// Smooth 1D value noise; range 0..1
function noise1D(x) {
  var ix = floor(x);
  var tx = x - ix;
  var ux = tx * tx * (3 - 2 * tx);
  return _hash1(ix) + (_hash1(ix + 1) - _hash1(ix)) * ux;
}

// Smooth 2D value noise, range [0, 1]
function noise2D(x, y) {
  var ix = floor(x), iy = floor(y);
  var tx = x - ix,   ty = y - iy;
  var ux = tx * tx * (3 - 2 * tx);
  var uy = ty * ty * (3 - 2 * ty);
  var a = _hash2(ix,     iy);
  var b = _hash2(ix + 1, iy);
  var c = _hash2(ix,     iy + 1);
  var d = _hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ─── Gradient noise ──────────────────────────────────────────────────────────

function _grad(ix, iy, tx, ty) {
  var h  = floor(_hash2(ix, iy) * 8);
  var gx = (h < 4) ? 1 : -1;
  var gy = (h < 2 || h >= 6) ? 1 : -1;
  return gx * tx + gy * ty;
}

// Slightly more organic than value noise, range ≈ [0, 1]
function gradNoise2D(x, y) {
  var ix = floor(x), iy = floor(y);
  var tx = x - ix,   ty = y - iy;
  var ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  var uy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  var a  = _grad(ix,     iy,     tx,     ty);
  var b  = _grad(ix + 1, iy,     tx - 1, ty);
  var c  = _grad(ix,     iy + 1, tx,     ty - 1);
  var d  = _grad(ix + 1, iy + 1, tx - 1, ty - 1);
  var v  = a + ux * (b - a) + uy * (c - a) + ux * uy * (a - b - c + d);
  return v * 0.5 + 0.5;
}

// ─── Fractal Brownian Motion ──────────────────────────────────────────────────
// Layered octaves for organic, cloud-like detail. 2–4 octaves is practical.

// 2-octave fBm; practical balance of detail vs. speed
function fbm2D_2(x, y) {
  return noise2D(x, y) * 0.5333
       + noise2D(x * 2.01, y * 2.01) * 0.2666;
}

// 3-octave fBm; more detail
function fbm2D_3(x, y) {
  return noise2D(x, y) * 0.4444
       + noise2D(x * 2.01, y * 2.01) * 0.2222
       + noise2D(x * 4.03, y * 4.03) * 0.1111;
}

// 4-octave fBm; maximum detail
function fbm2D_4(x, y) {
  return noise2D(x, y) * 0.3810
       + noise2D(x * 2.01, y * 2.01) * 0.1905
       + noise2D(x * 4.03, y * 4.03) * 0.0952
       + noise2D(x * 8.07, y * 8.07) * 0.0476;
}

// ─── Domain warp ─────────────────────────────────────────────────────────────
// Distort coordinates with noise before sampling — creates fluid, swirling shapes.
// strength: displacement amount (try 0.2–0.5)

// Displace x with noise; try strength 0.2–0.5
function warpX(x, y, t, strength) {
  return x + noise2D(x + t * 0.3, y + 0.5) * strength - strength * 0.5;
}
// Displace y with noise; try strength 0.2–0.5
function warpY(x, y, t, strength) {
  return y + noise2D(x + 0.5, y + t * 0.3) * strength - strength * 0.5;
}

// ─── Voronoi ─────────────────────────────────────────────────────────────────
// Distance to nearest cell centre in a random grid, range ≈ [0, 0.7]

function voronoiDist(x, y) {
  var ix = floor(x), iy = floor(y);
  var md = 8.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var cx = ix + dx, cy = iy + dy;
      var px = cx + _hash2(cx, cy);
      var py = cy + _hash2(cx + 1237, cy + 4567);
      var ex = x - px, ey = y - py;
      var d  = ex * ex + ey * ey;
      if (d < md) md = d;
    }
  }
  return sqrt(md);
}

// Stable [0,1) float per voronoi cell (use for per-cell colour)
function voronoiID(x, y) {
  var ix = floor(x), iy = floor(y);
  var md = 8.0;
  var id = 0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      var cx = ix + dx, cy = iy + dy;
      var px = cx + _hash2(cx, cy);
      var py = cy + _hash2(cx + 1237, cy + 4567);
      var ex = x - px, ey = y - py;
      var d  = ex * ex + ey * ey;
      if (d < md) { md = d; id = _hash2(cx * 3, cy * 7); }
    }
  }
  return id;
}
