// Kishimisu — port of "An introduction to Shader Art Coding" by kishimisu.
//   Original GLSL (kishimisu, ShaderToy): https://www.shadertoy.com/view/mtyGWy
//   Companion tutorial video:             https://youtu.be/f4s1h2YETNY
//
// Inigo Quilez palette function `a + b*cos(2π·(c·t + d))` paints a 4-octave
// kaleidoscope of folded space. Each octave folds uv into `fract(uv*zoom)-0.5`,
// then a sharpened sine ring is multiplied in. Bright veins where multiple
// octaves align; dark voids elsewhere.

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

export function beforeRender(delta) {
  t = t + delta * 0.001
}

// ── render2D ──────────────────────────────────────────────────────────────
export function render2D(index, x, y) {
  // Map raw 0..1 slider vars to their working ranges
  var zoomM        = 1.0   + zoom * 1.5
  var ringDensityM = 2     + ringDensity * 18
  var glowM        = 0.002 + glow * 0.048
  var sharpnessM   = 0.5   + sharpness * 2.5
  var octavesM     = clamp(floor(octaves * 6) + 1, 1, 6)

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

  for (var i = 0; i < octavesM; i = i + 1) {
    // Shader.fract is floor-based (always [0,1)) — built-in frac() is
    // truncate-based and returns negatives, which breaks the fold.
    px = Shader.fract(px * zoomM) - 0.5
    py = Shader.fract(py * zoomM) - 0.5

    var luv = hypot(px, py)
    var d = luv * exp0

    // IQ cosine palette (c hard-coded to 1,1,1) → cr/cg/cb out-vars.
    Shader.iqPalette(len0 + i * 0.4 + t * 0.4,
                     paletteAr, paletteAg, paletteAb,
                     paletteBr, paletteBg, paletteBb,
                     1, 1, 1,
                     paletteDr, paletteDg, paletteDb)

    d = sin(d * ringDensityM + t) / ringDensityM
    d = abs(d)
    d = pow(glowM / d, sharpnessM)

    finalR = finalR + cr * d
    finalG = finalG + cg * d
    finalB = finalB + cb * d
  }

  rgb(finalR, finalG, finalB)
}
