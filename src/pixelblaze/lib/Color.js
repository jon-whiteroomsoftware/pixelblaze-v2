// Color — colour math, palettes, and blend modes
//
// Pixelblaze uses HSV natively (hsv(h,s,v) outputs to the current pixel).
// These helpers do colour math before you call hsv()/rgb().
//
// Assumes: abs, floor, min, max, clamp, pow, sqrt, wave

// ─── Hue arithmetic ──────────────────────────────────────────────────────────

// Interpolate hue from h0 to h1 at t, taking the shortest arc around the wheel
function lerpHue(h0, h1, t) {
  var d = h1 - h0;
  if (d >  0.5) d -= 1;
  if (d < -0.5) d += 1;
  return ((h0 + d * t) % 1 + 1) % 1;
}

function complementHue(h) { return (h + 0.5) % 1; }

// Analogous hue offset by fraction f (try ±0.083 for ±30°)
function analogousHue(h, f) { return (h + f + 1) % 1; }

// Triadic hue; pass index 0, 1, or 2
function triadicHue(h, i) { return (h + i / 3) % 1; }

// ─── Full HSV interpolation ───────────────────────────────────────────────────
// Sets module-level outH, outS, outV; call hsv(outH, outS, outV) afterward.
var outH = 0, outS = 0, outV = 0;

function lerpHSV(h0, s0, v0, h1, s1, v1, t) {
  outH = lerpHue(h0, h1, t);
  outS = s0 + (s1 - s0) * t;
  outV = v0 + (v1 - v0) * t;
}

// ─── Palettes ─────────────────────────────────────────────────────────────────

function paletteLinear(t, hStart, hEnd) {
  return lerpHue(hStart, hEnd, t);
}

// Fire: call with saturation=1, value=fireValue(t)
function fireHue(t)   { return clamp(t, 0, 0.17); }
function fireValue(t) { return clamp(t * 1.5, 0, 1); }
function fireSat(t)   { return clamp(1.5 - t, 0, 1); }

// Ice
function iceHue(t)   { return 0.58 + t * 0.08; }
function iceSat(t)   { return clamp(1.5 - t, 0, 1); }
function iceValue(t) { return clamp(t * 1.2, 0, 1); }

function rainbowHue(t) { return t % 1; }

function neonHue(t)   { return t % 1; }
function neonSat()    { return 1; }
function neonValue(t) { return 0.7 + wave(t * 3) * 0.3; }

// ─── Blend modes ─────────────────────────────────────────────────────────────

function blendAdd(a, b)        { return min(a + b, 1); }
function blendMul(a, b)        { return a * b; }
function blendScreen(a, b)     { return 1 - (1 - a) * (1 - b); }
function blendOverlay(a, b)    { return a < 0.5 ? 2 * a * b : 1 - 2 * (1-a) * (1-b); }
function blendDifference(a, b) { return abs(a - b); }
function blendHardLight(a, b)  { return b < 0.5 ? 2*a*b : 1 - 2*(1-a)*(1-b); }
function blendSoftLight(a, b) {
  return b < 0.5
    ? a - (1 - 2*b) * a * (1 - a)
    : a + (2*b - 1) * ((a < 0.25 ? ((16*a - 12)*a + 4)*a : sqrt(a)) - a);
}
function blendMax(a, b)        { return max(a, b); }
function blendMin(a, b)        { return min(a, b); }
function blendMix(a, b, t)     { return a + (b - a) * t; }

// ─── Brightness adjustments ──────────────────────────────────────────────────

function gamma(v, g)      { return pow(clamp(v, 0, 1), g); }
function boost(v, amount) { return clamp(v + amount * (1 - v), 0, 1); }
function contrast(v, amount) { return clamp((v - 0.5) * amount + 0.5, 0, 1); }

// Sets outH, outS, outV to a warm (orange→yellow-white) colour for brightness t
function tempToHSV(t) {
  outH = clamp(0.08 - t * 0.08, 0, 1);
  outS = clamp(1 - t * 0.8, 0, 1);
  outV = clamp(t * 1.2, 0, 1);
}
