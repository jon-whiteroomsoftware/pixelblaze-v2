// Caustics — shimmering light on a pool floor.
//
// A cheap animated Voronoi layer is crossed with an organic noise layer; the
// interference of their light pools produces wandering filaments like focused
// light on the bottom of a swimming pool. A slow depth-shimmer crossing the
// whole pool adds the feeling of sun filtering through moving water.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0.5      // how fast the water moves
export var density = 0.4    // caustic cell density (zoom)
export var sharpness = 0.33 // focus — soft pools vs. crisp veins
export var tint = 0.52      // base water hue (0..1 of the colour wheel)

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderSharpness(v) { sharpness = v }
export function sliderTint(v) { tint = v }

export var t

// Frame-global scratch — slider- and time-only values the per-pixel path reads.
// SCALE/sharp depend only on sliders; the layer drift offsets are five sin/cos of
// the time phase `ph`, none of which depend on the pixel. Hoisting them out of
// render2D removes 5 trig calls/pixel (guide §6). The drift offsets fold into the
// per-pixel `x*SCALE + …` via integer adds, which are exact in 16.16 (no rounding),
// so this stays output-preserving.
var SCALE, sharp
var offAx, offAy, offBx, offBy

export function beforeRender(delta) {
  t = time(0.1) * (0.5 + speed * 3)
  SCALE = 3 + density * 5
  sharp = 1.2 + sharpness * 1.5
  var ph = t * PI2
  offAx = sin(ph) * 0.6 + sin(ph * 0.37) * 0.4
  offAy = cos(ph * 0.9) * 0.6
  offBx = -(cos(ph * 0.8) * 0.5)
  offBy = sin(ph * 1.1) * 0.7
}

export function render2D(index, x, y) {
  // Layer A — slow, large-scale drift. The four-cell helper keeps one real
  // nearest-cell field while avoiding a full 3x3 Voronoi scan.
  var ax = x * SCALE + offAx
  var ay = y * SCALE + offAy
  var dA = Noise.voronoiDist4(ax, ay)

  // Layer B — faster, finer, counter-drifting synthetic field. Use coherent
  // noise instead of a single planar wave so large layouts do not reveal
  // repetitive diagonal bands.
  var bx = x * SCALE * 1.3 + offBx
  var by = y * SCALE * 1.3 + offBy
  var dB = Noise.noise2D(bx + t * 1.7, by - t * 1.3) * 0.42

  // Sharp focal pools near each layer's cell centres. The cubic is written out
  // explicitly so hardware avoids two per-pixel pow() calls.
  var qA = 1 - clamp(dA * sharp, 0, 1)
  var qB = 1 - clamp(dB * sharp, 0, 1)
  var cA = qA * qA * qA
  var cB = qB * qB * qB

  // Veins (where both layers are bright) plus soft overall pooling
  var light = clamp(cA * cB * 2.5 + (cA + cB) * 0.5, 0, 1)
  // A close, cheap curve for the original pow(light, 1.3).
  light = light * (0.72 + 0.28 * light)

  // Slow depth shimmer sweeping across the pool (sun through water)
  var depth = 0.6 + 0.4 * triangle(x * 0.5 + y * 0.3 + t * 0.5)
  light = light * depth

  // Water: dim tinted base, brightening to near-white at the focal lines,
  // with a faint iridescent hue drift along the veins.
  var hue = frac(tint - light * 0.08 + 0.04 * triangle(t * 0.3 + x))
  var sat = clamp(0.9 - light * 1.0, 0.1, 0.9)
  var val = clamp(0.05 + light * 1.15, 0, 1)
  hsv(hue, sat, val)
}
