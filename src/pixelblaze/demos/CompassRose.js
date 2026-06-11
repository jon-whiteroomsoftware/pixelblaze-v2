// Compass Rose — rotating angular bands and cardinal glints.
//
// Polar quantization gives a crisp instrument-panel look with no loops and only
// one atan2/hypot pair per pixel.

export var speed = 0.35       // rotation speed
export var points = 0.56      // number of rose points
export var sweep = 0.50       // scanning beam strength
export var hue = 0.58         // base colour

export function sliderSpeed(v) { speed = v }
export function sliderPoints(v) { points = v }
export function sliderSweep(v) { sweep = v }
export function sliderHue(v) { hue = v }

export var t = 0
var pointCount

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.2)
  pointCount = 8 + floor(points * 16)
}

export function render2D(index, x, y) {
  var dx = x - 0.5, dy = y - 0.5
  var r = hypot(dx, dy)
  var a = atan2(dy, dx) / PI2 + t * 0.035
  var spoke = clamp(1 - abs(triangle(a * pointCount) - 0.5) * 5.4, 0, 1)
  var card = clamp(1 - abs(triangle(a * 4) - 0.5) * 7.0, 0, 1)
  var rings = clamp(1 - abs(triangle(r * 9 - t * 0.04) - 0.5) * 4.0, 0, 1)
  var beam = triangle(a + t * 0.10) * sweep
  var mask = clamp(1 - abs(r - 0.34) * 2.3, 0, 1)
  var val = clamp((spoke * 0.42 + card * 0.45 + rings * 0.38 + beam * 0.18) * mask, 0, 1)
  hsv(frac(hue + a * 0.10 + r * 0.18), 0.78, val)
}
