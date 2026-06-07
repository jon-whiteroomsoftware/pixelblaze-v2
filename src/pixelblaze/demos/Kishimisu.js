// Kishimisu — port of "An introduction to Shader Art Coding" by kishimisu.
//   Original GLSL (kishimisu, ShaderToy): https://www.shadertoy.com/view/mtyGWy
//   Companion tutorial video:             https://youtu.be/f4s1h2YETNY
//
// Inigo Quilez palette function `a + b*cos(2π·(c·t + d))` paints a 4-octave
// kaleidoscope of folded space. Each octave folds uv into `fract(uv*zoom)-0.5`,
// then a sharpened sine ring is multiplied in. Bright veins where multiple
// octaves align; dark voids elsewhere.
//
// ── Optimization pass (#248) ────────────────────────────────────────────────
// Worked example for docs/guides/Optimizing Pixelblaze patterns.md. Three
// output-preserving, frame-global factorings, each checksum-gated on the
// emulator bench (`npm run bench -- Kishimisu`):
//   1. The five slider→working-range remaps → beforeRender (were per-pixel).
//   2. invRingDensityM = 1/ringDensityM (per-octave divide → multiply) and
//      t04 = t*0.4 precomputed once/frame.
//   3. The per-octave palette phase i*0.4 → a running accumulator (mul → add).
// Measured on hardware (fw 3.67, 16×16): 8.7 → 9.1 FPS (+4.6%, free). The cost
// table predicts a ~10% cut to the per-pixel body; the whole-frame gain is less
// because fixed per-frame overhead (LED output, map walk) dilutes it (~44% of
// the frame is the body we trimmed).
// The emulator bench can't *show* this — it runs every built-in as native JS,
// so mul/add/div are near-free and the per-octave cos/sin/pow/exp dominate; the
// bench's role here is the checksum guard, not the stopwatch. The fat hardware
// items left (3× cos and the pow per octave; the per-pixel exp; the octave
// count) are documented in the guide as hardware-wisdom / quality knobs.
// Note: change 2's reciprocal-multiply is a deliberate 16.16 divergence — the
// Precise checksum shifts (Fast holds); accepted, since hardware ships the same
// reciprocal and the delta is sub-perceptual.

// ── Palette pickers (IQ a, b, d; c is hard-coded to (1,1,1)) ──────────────
var paletteAr = 0.5,   paletteAg = 0.5,   paletteAb = 0.5
var paletteBr = 0.5,   paletteBg = 0.5,   paletteBb = 0.5
var paletteDr = 0.263, paletteDg = 0.416, paletteDb = 0.557

export function rgbPickerPaletteA(r, g, b) { paletteAr = r; paletteAg = g; paletteAb = b }
export function rgbPickerPaletteB(r, g, b) { paletteBr = r; paletteBg = g; paletteBb = b }
export function rgbPickerPaletteD(r, g, b) { paletteDr = r; paletteDg = g; paletteDb = b }

// ── Inner-loop sliders (raw 0..1; mapped to working ranges in render2D) ──
export var zoom        = 0.333 // → 1.0 + zoom*1.5         (1.5)
export var ringDensity = 0.333 // → 2 + ringDensity*18     (8)
export var glow        = 0.167 // → 0.002 + glow*0.048     (≈0.01)
export var sharpness   = 0.28  // → 0.5 + sharpness*2.5    (1.2)
export var octaves     = 0.5   // → floor(octaves*6) + 1   (4)

export function sliderZoom(v)        { zoom        = v }
export function sliderRingDensity(v) { ringDensity = v }
export function sliderGlow(v)        { glow        = v }
export function sliderSharpness(v)   { sharpness   = v }
export function sliderOctaves(v)     { octaves     = v }

// ── Time accumulator (iTime in seconds; IDE speed pre-applied to delta) ──
export var t = 0

// ── Frame-constant working values (computed once/frame in beforeRender) ──
// The five slider→working-range remaps are identical for every pixel, so they
// belong here, not in render2D. Step 1 of the #248 optimization pass.
var zoomM = 1.5, ringDensityM = 8, glowM = 0.01, sharpnessM = 1.2, octavesM = 4
// Frame-constant derived terms: a reciprocal (so the per-octave divide becomes a
// multiply) and the time-only palette phase term. Step 2 of #248.
var invRingDensityM = 1 / 8, t04 = 0

export function beforeRender(delta) {
  t = t + delta * 0.001

  zoomM        = 1.0   + zoom * 1.5
  ringDensityM = 2     + ringDensity * 18
  glowM        = 0.002 + glow * 0.048
  sharpnessM   = 0.5   + sharpness * 2.5
  octavesM     = clamp(floor(octaves * 6) + 1, 1, 6)

  invRingDensityM = 1 / ringDensityM
  t04             = t * 0.4
}

// ── render2D ──────────────────────────────────────────────────────────────
export function render2D(index, x, y) {
  // Centred uv via Shader.toUV (short axis = unit). The engine normalises
  // (x,y) to [0,1]² per-axis, so aspect is hardcoded to 1: a square grid
  // reproduces the original's direct 2x-1 / 2y-1. Non-square grids stretch —
  // an accepted limitation (#96): the preview exposes no cols/rows built-in to
  // derive a true aspect from.
  Shader.toUV(x, y, 1)
  var px = ux, py = uy          // Shader.toUV writes the ux/uy out-vars
  var len0 = hypot(px, py)
  var exp0 = exp(-len0)

  var finalR = 0, finalG = 0, finalB = 0

  // Palette phase = len0 + i*0.4 + t04. The i*0.4 term is the only per-octave
  // part, so accumulate it (one add/octave) instead of a multiply. Step 3, #248.
  var phase = len0 + t04

  for (var i = 0; i < octavesM; i = i + 1) {
    // Shader.fract is floor-based (always [0,1)) — built-in frac() is
    // truncate-based and returns negatives, which breaks the fold.
    px = Shader.fract(px * zoomM) - 0.5
    py = Shader.fract(py * zoomM) - 0.5

    var luv = hypot(px, py)
    var d = luv * exp0

    // IQ cosine palette (c hard-coded to 1,1,1) → cr/cg/cb out-vars.
    Shader.iqPalette(phase,
                     paletteAr, paletteAg, paletteAb,
                     paletteBr, paletteBg, paletteBb,
                     1, 1, 1,
                     paletteDr, paletteDg, paletteDb)

    d = sin(d * ringDensityM + t) * invRingDensityM
    d = abs(d)
    d = pow(glowM / d, sharpnessM)

    finalR = finalR + cr * d
    finalG = finalG + cg * d
    finalB = finalB + cb * d

    phase = phase + 0.4
  }

  rgb(finalR, finalG, finalB)
}
