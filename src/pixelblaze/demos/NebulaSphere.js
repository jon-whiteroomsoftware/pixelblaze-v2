// Nebula Sphere — a volumetric 3D port of PlasmaNebula. Where the 2D version
// spent the third Perlin axis on time, this one feeds each point's real
// (x,y,z) straight into 3D fBm, so the model carves a coherent slice out of a
// true 3D gas volume. No longitude seam, no pole pinch, and no geometry
// self-calibration: it's purely coordinate-driven, so it looks right on the
// Sphere, the Cube, and the Star maps alike — flip the map and watch the same
// volume re-slice.
//
// The "warp the warp" technique (Inigo Quilez), now in 3D: sample fBm, use it
// to displace all three coords, sample again, displace again — ~9-12 perlin
// calls per pixel. This is the extremes demo; the cost is the point.
//
// Animation: with all three noise axes spatial, there's no time axis to drift,
// so we drift the *sample point* through the volume instead — p = pos*scale +
// driftVec*t. The whole nebula flows past the model.
//
// Note: perlin is algorithmically divergent in Precise mode (REFERENCE 8.4) —
// a "what the preview can render" showcase, consistent with PlasmaNebula.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0.24   // drift speed of the gas through the volume
export var zoom = 0.72     // detail scale (higher = finer, busier)
export var warp = 0.2     // how violently the field folds
export var twinkle = 0.2  // star density in the voids

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderWarp(v) { warp = v }
export function sliderTwinkle(v) { twinkle = v }

// pos, r, g, b — all 0..1 (Pixelblaze palette convention)
var nebula = [
  0.00, 0.01, 0.00, 0.05,  // near-black indigo (void)
  0.35, 0.18, 0.02, 0.38,  // deep purple
  0.55, 0.60, 0.06, 0.48,  // magenta
  0.74, 0.98, 0.34, 0.22,  // orange
  0.90, 1.00, 0.86, 0.55,  // warm white
  1.00, 0.72, 0.90, 1.00,  // cool highlight
]

// Drift offset through the volume. We integrate it in beforeRender rather than
// reading time() directly so the speed slider changes the rate cleanly without
// time-wrap discontinuities — and so the drift is a true 3D vector, not a
// single shared axis.
export var dx = 0, dy = 0, dz = 0
// Frame-constant scale / warp strength / twinkle threshold (slider-derived) —
// hoisted out of the per-pixel path.
var s, w, thresh

export function beforeRender(delta) {
  setPalette(nebula)
  // delta is in ms (16.16 ticks); convert to seconds and advance the drift
  // along a gently irregular direction so the gas never just slides flat.
  var dt = delta / 1000 * (0.3 + speed * 1.6)
  dx += dt * 0.62
  dy += dt * 0.31
  dz += dt * 0.48
  s = 1.5 + zoom * 3       // coordinate scale
  w = 2 + warp * 4         // warp displacement strength
  thresh = 0.995 - twinkle * 0.03
}

export function render3D(index, x, y, z) {
  var px = x * s + dx, py = y * s + dy, pz = z * s + dz

  // First warp layer
  var q1 = perlinFbm(px,       py,       pz,       2, 0.5, 4)
  var q2 = perlinFbm(px + 5.2, py + 1.3, pz + 2.8, 2, 0.5, 4)
  var q3 = perlinFbm(px + 3.1, py + 8.7, pz + 4.4, 2, 0.5, 4)

  // Second warp, displaced by the first
  var r1 = perlinFbm(px + w * q1,       py + w * q2,       pz + w * q3,       2, 0.5, 4)
  var r2 = perlinFbm(px + w * q1 + 1.7, py + w * q2 + 9.2, pz + w * q3 + 6.5, 2, 0.5, 4)
  var r3 = perlinFbm(px + w * q1 + 4.3, py + w * q2 + 2.1, pz + w * q3 + 7.9, 2, 0.5, 4)

  // Final density field, displaced by the second
  var f = perlinFbm(px + w * r1, py + w * r2, pz + w * r3, 2, 0.5, 3)

  var density = clamp((f - 0.2) * 1.7, 0, 1)
  density = pow(density, 1.3)

  // Star twinkle: stable per-cell hash, only in the dark voids. Uses
  // Shader.hash21 (pure integer arithmetic) rather than the classic GLSL
  // frac(sin(dot(..))*43758.5453) trick — those huge constants overflow 16.16
  // and the sin diverges, so that idiom looks fine here but breaks on hardware.
  var hsh = Shader.hash21(floor(x * 80) + floor(z * 53), floor(y * 80))
  if (hsh > thresh && density < 0.35) {
    var tw = wave(dx * 5 + hsh * 9)
    paint(0.94, max(density, tw * tw))
  } else {
    paint(0.12 + r1 * 0.82, density)
  }
}
