// Magnetic Filaments — soft field lines bending around moving attractors.
//
// Designed for Pixelblaze rather than ported from ShaderToy: a tiny fixed set
// of moving "magnets" contributes inverse-distance fields, and the colour comes
// from the signed balance between them. Rich motion, few expensive calls.

export var speed = 0.08       // field drift speed
export var spacing = 0        // filament density
export var glow = 1           // line brightness
export var contrast = 0.96    // field-line sharpness

export function sliderSpeed(v) { speed = v }
export function sliderSpacing(v) { spacing = v }
export function sliderGlow(v) { glow = v }
export function sliderContrast(v) { contrast = v }

export var t = 0
var ax0, ay0, ax1, ay1, ax2, ay2
var density, gain, sharp

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.25 + speed * 1.8)

  ax0 = 0.50 + 0.28 * cos(t * 0.73)
  ay0 = 0.50 + 0.24 * sin(t * 0.61)
  ax1 = 0.50 + 0.31 * cos(t * -0.52 + 2.1)
  ay1 = 0.50 + 0.25 * sin(t * 0.87 + 0.6)
  ax2 = 0.50 + 0.18 * cos(t * 1.13 + 4.0)
  ay2 = 0.50 + 0.32 * sin(t * -0.43 + 1.8)

  density = 8 + spacing * 26
  gain = 0.5 + glow * 1.8
  sharp = 0.12 + contrast * 0.22
}

function chargeField(x, y, cx, cy, polarity) {
  var dx = x - cx, dy = y - cy
  return polarity / (0.045 + dx * dx + dy * dy)
}

export function render2D(index, x, y) {
  var f = chargeField(x, y, ax0, ay0, 1)
        + chargeField(x, y, ax1, ay1, -1)
        + chargeField(x, y, ax2, ay2, 0.7)

  // Field lines are just contour bands of the signed scalar field.
  var band = abs(triangle(f * density * 0.011 + t * 0.06) - 0.5) * 2
  var line = clamp(1 - band / sharp, 0, 1)
  line = line * line

  // Magnet cores give the eye something to orbit around.
  var c0 = SDF.fillGlow(SDF.circle(x, y, ax0, ay0, 0.035), 0.08)
  var c1 = SDF.fillGlow(SDF.circle(x, y, ax1, ay1, 0.030), 0.07)
  var c2 = SDF.fillGlow(SDF.circle(x, y, ax2, ay2, 0.025), 0.06)
  var core = max(c0, max(c1, c2)) * 0.55

  var hue = frac(0.58 + f * 0.018 + t * 0.025)
  hsv(hue, 0.82 - core * 0.35, clamp(line * gain + core, 0, 1))
}
