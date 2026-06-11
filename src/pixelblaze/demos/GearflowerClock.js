// Gearflower Clock — interlocking mechanical petals.
//
// Radial triangle waves approximate gear teeth far more cheaply than many
// polygon SDFs, while SDF rings provide the clockwork structure.

export var speed = 0.38       // gear rotation speed
export var teeth = 0.55       // tooth density
export var bloom = 0.58       // petal/body brightness
export var hue = 0.13         // brass-to-neon colour

export function sliderSpeed(v) { speed = v }
export function sliderTeeth(v) { teeth = v }
export function sliderBloom(v) { bloom = v }
export function sliderHue(v) { hue = v }

export var t = 0
var toothCount, spin

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.10 + speed * 1.25)
  toothCount = 7 + floor(teeth * 10)
  spin = t * 0.22
}

function gear(x, y, cx, cy, r, phase) {
  var dx = x - cx, dy = y - cy
  var dist = hypot(dx, dy)
  var a = atan2(dy, dx) / PI2
  var tooth = triangle(a * toothCount + phase) - 0.5
  var edge = abs(dist - (r + tooth * 0.035)) - 0.020
  var shell = clamp(1 - abs(edge) / 0.045, 0, 1)
  var hub = clamp(1 - max(abs(dx), abs(dy)) / (r * 0.34), 0, 1)
  return shell * (0.45 + bloom * 0.7) + hub * 0.45
}

export function render2D(index, x, y) {
  var g0 = gear(x, y, 0.50, 0.50, 0.29, spin)
  // Satellite gears keep the clockwork composition, but are ring-only to avoid
  // three polar tooth fields per pixel on hardware.
  var dx1 = x - 0.28, dy1 = y - 0.36
  var g1 = clamp(1 - abs(hypot(dx1, dy1) - 0.18) / 0.050, 0, 1) * (0.35 + bloom * 0.45)
  var dx2 = x - 0.72, dy2 = y - 0.64
  var g2 = clamp(1 - abs(hypot(dx2, dy2) - 0.18) / 0.050, 0, 1) * (0.35 + bloom * 0.45)
  var r = hypot(x - 0.5, y - 0.5)
  var ring = clamp(1 - abs(r - 0.40) / 0.030, 0, 1) * 0.32
  var val = clamp(max(g0, max(g1, g2)) + ring, 0, 1)
  hsv(frac(hue + val * 0.07 + ring * 0.12), 0.84, val)
}
