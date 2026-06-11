// Signal Mandala — radial spokes, rings, and scanning pulses.
//
// This uses polar symmetry and triangle bands: lots of ornament from a handful
// of cheap waveform operations.

export var speed = 0.52       // scanning speed
export var spokes = 0.48      // radial spoke count
export var rings = 0.36       // ring density
export var color = 0.64       // base hue

export function sliderSpeed(v) { speed = v }
export function sliderSpokes(v) { spokes = v }
export function sliderRings(v) { rings = v }
export function sliderColor(v) { color = v }

export var t = 0
var spokeCount, ringCount

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.18 + speed * 1.45)
  spokeCount = 6 + floor(spokes * 18)
  ringCount = 4 + rings * 13
}

export function render2D(index, x, y) {
  var dx = x - 0.5, dy = y - 0.5
  var r = hypot(dx, dy)
  var a = atan2(dy, dx) / PI2

  var spoke = clamp(1 - abs(triangle(a * spokeCount + t * 0.08) - 0.5) * 4.2, 0, 1)
  var ring = clamp(1 - abs(triangle(r * ringCount - t * 0.07) - 0.5) * 3.7, 0, 1)
  var scan = triangle(a * 3 + r * 2.2 + t * 0.18)
  var mask = clamp(1 - r * 1.72, 0, 1)
  var val = clamp((spoke * 0.62 + ring * 0.72 + spoke * ring * 0.58) * mask + scan * mask * 0.18 + mask * 0.035, 0, 1)
  hsv(frac(color + a * 0.18 + r * 0.24 + t * 0.015), 0.78, val)
}
