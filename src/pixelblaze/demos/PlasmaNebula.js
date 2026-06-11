// Plasma Nebula — iterative domain-warped Perlin flow painted through a
// deep-space palette, with star twinkle in the voids.
//
// The "warp the warp" technique (Inigo Quilez): sample fBm noise, use it to
// displace the coordinates, sample again, displace again. Each pass folds the
// field into the filaments and voids that read as interstellar gas.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0.35   // drift speed of the gas
export var zoom = 0.37    // detail scale (higher = finer, busier)
export var warp = 0.5     // how violently the field folds
export var twinkle = 0.33 // star density in the voids
export var hue = 0.09     // palette hue offset

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderWarp(v) { warp = v }
export function sliderTwinkle(v) { twinkle = v }
export function sliderHue(v) { hue = v }

// pos, r, g, b — all 0..1 (Pixelblaze palette convention)
var nebula = [
  0.00, 0.01, 0.00, 0.05,  // near-black indigo (void)
  0.35, 0.18, 0.02, 0.38,  // deep purple
  0.55, 0.60, 0.06, 0.48,  // magenta
  0.74, 0.98, 0.34, 0.22,  // orange
  0.90, 1.00, 0.86, 0.55,  // warm white
  1.00, 0.72, 0.90, 1.00,  // cool highlight
]

export var t
// Frame-constant scale / warp strength / twinkle threshold (slider-derived) —
// hoisted out of the per-pixel path.
var s, w, thresh

export function beforeRender(delta) {
  setPalette(nebula)
  t = time(0.15) * (2 + speed * 8)  // drift the z-slice through noise cells
  s = 1.5 + zoom * 3       // coordinate scale
  w = 2 + warp * 4         // warp displacement strength
  thresh = 0.995 - twinkle * 0.03
}

export function render2D(index, x, y) {
  var px = x * s, py = y * s

  // First warp layer
  var q1 = perlinFbm(px,       py,       t, 2, 0.5, 3)
  var q2 = perlinFbm(px + 5.2, py + 1.3, t, 2, 0.5, 3)

  // Second warp, displaced by the first
  var r1 = perlinFbm(px + w * q1,       py + w * q2,       t, 2, 0.5, 3)
  var r2 = perlinFbm(px + w * q1 + 1.7, py + w * q2 + 9.2, t, 2, 0.5, 3)

  // Final density field, displaced by the second
  var f = perlinFbm(px + w * r1, py + w * r2, t + 10, 2, 0.5, 3)

  var density = clamp((f - 0.2) * 1.7, 0, 1)
  density = pow(density, 1.3)

  // Star twinkle: stable per-cell hash, only in the dark voids. Uses
  // Shader.hash21 (pure integer arithmetic) rather than the classic GLSL
  // frac(sin(dot(..))*43758.5453) trick — those huge constants overflow 16.16
  // and the sin diverges, so that idiom looks fine here but breaks on hardware.
  var hsh = Shader.hash21(floor(x * 80), floor(y * 80))
  if (hsh > thresh && density < 0.35) {
    var tw = wave(t * 5 + hsh * 9)
    paint(frac(0.94 + hue), max(density, tw * tw))
  } else {
    paint(frac(0.12 + r1 * 0.82 + hue), density)
  }
}
