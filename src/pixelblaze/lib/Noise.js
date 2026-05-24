// Noise — noise, randomness, and organic variation
//
// All functions are pure scalar — no arrays, no dynamic allocation.
// Assumes: sin, cos, sqrt, abs, floor, min, max, clamp, PI

// ─── Integer hashes ──────────────────────────────────────────────────────────

function _hash2(ix, iy) {
  var h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = (h * 1274126177) | 0;
  h = (h ^ (h >> 16)) | 0;
  return (h >>> 0) / 4294967296;
}

function _hash1(n) {
  n = (n ^ 61) ^ (n >> 16);
  n = n + (n << 3);
  n = n ^ (n >> 4);
  n = n * 0x27d4eb2d;
  n = n ^ (n >> 15);
  return ((n >>> 0) & 0xffff) / 65536;
}

// ─── Value noise ─────────────────────────────────────────────────────────────

// Smooth 1D value noise; range 0..1
function noise1D(x) {
  var ix = floor(x);
  var fx = x - ix;
  var ux = fx * fx * (3 - 2 * fx);
  return _hash1(ix) + (_hash1(ix + 1) - _hash1(ix)) * ux;
}

// Smooth 2D value noise, range [0, 1]
function noise2D(x, y) {
  var ix = floor(x), iy = floor(y);
  var fx = x - ix,   fy = y - iy;
  var ux = fx * fx * (3 - 2 * fx);
  var uy = fy * fy * (3 - 2 * fy);
  var a = _hash2(ix,     iy);
  var b = _hash2(ix + 1, iy);
  var c = _hash2(ix,     iy + 1);
  var d = _hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ─── Gradient noise ──────────────────────────────────────────────────────────

function _grad(ix, iy, fx, fy) {
  var h  = (_hash2(ix, iy) * 8) | 0;
  var gx = (h < 4) ? 1 : -1;
  var gy = (h < 2 || h >= 6) ? 1 : -1;
  return gx * fx + gy * fy;
}

// Slightly more organic than value noise, range ≈ [0, 1]
function gradNoise2D(x, y) {
  var ix = floor(x), iy = floor(y);
  var fx = x - ix,   fy = y - iy;
  var ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  var uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  var a  = _grad(ix,     iy,     fx,     fy);
  var b  = _grad(ix + 1, iy,     fx - 1, fy);
  var c  = _grad(ix,     iy + 1, fx,     fy - 1);
  var d  = _grad(ix + 1, iy + 1, fx - 1, fy - 1);
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
