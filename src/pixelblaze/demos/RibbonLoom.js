// Ribbon Loom — luminous SDF ribbons weaving over and under each other.
//
// A small fixed set of triangle-wave paths is enough to suggest fabric. The
// first draft used per-pixel sine paths; triangle paths keep the weave language
// while being much friendlier on Pixelblaze hardware.

export var speed = 1          // weave motion
export var width = 0          // ribbon width
export var count = 0.79       // number of active ribbon families
export var palette = 0.57     // base hue

export function sliderSpeed(v) { speed = v }
export function sliderWidth(v) { width = v }
export function sliderCount(v) { count = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var w, active, invW
var p0, p1, p2, p3

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.2 + speed * 1.6)
  w = 0.018 + width * 0.055
  invW = 1 / (w + 0.055)
  active = 3 + floor(count * 2) // 3..5 apparent ribbons, capped for hardware FPS
  p0 = t * 0.18
  p1 = t * 0.21 + 0.27
  p2 = t * 0.24 + 0.54
  p3 = t * 0.27 + 0.81
}

function ribbonValue(x, y, lane, amp, freq, phase, hueOffset) {
  var path = (triangle(x * freq + phase) - 0.5) * 2
  var d = abs(y - (lane + amp * path))
  var body = clamp(1 - d * invW, 0, 1)
  var edge = clamp(1 - abs(d - w) * 85, 0, 1)
  var weave = triangle(x * (freq + 2.2) + phase)
  var over = weave > 0.5 ? 1.1 : 0.74
  return body * body * over + edge * 0.22 + hueOffset * 0.0001
}

export function render2D(index, x, y) {
  var c0 = ribbonValue(x, y, 0.22, 0.08, 1.25, p0, 0)
  var c1 = ribbonValue(x, y, 0.40, 0.10, 1.48, p1, 1)
  var c2 = ribbonValue(x, y, 0.58, 0.09, 1.72, p2, 2)
  var c3 = 0
  // The fourth ribbon only occupies the top band; skipping it elsewhere keeps
  // the full high-count look while avoiding a wasted path evaluation per pixel.
  if (active > 3 && y > 0.56) c3 = ribbonValue(x, y, 0.76, 0.11, 1.96, p3, 3)

  var val = c0
  var hue = palette
  if (c1 > val) { val = c1; hue = palette + 0.145 }
  if (c2 > val) { val = c2; hue = palette + 0.290 }
  if (c3 > val) { val = c3; hue = palette + 0.435 }

  // Subtle loom threads in the background.
  var thread = 0.08 * triangle(x * 18 + t * 0.05) * triangle(y * 14 - t * 0.04)
  hsv(frac(hue + val * 0.04), 0.88, clamp(val + thread, 0, 1))
}
