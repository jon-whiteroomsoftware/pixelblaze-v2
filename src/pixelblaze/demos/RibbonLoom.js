// Ribbon Loom — luminous SDF ribbons weaving over and under each other.
//
// A small fixed set of sine paths is enough to suggest fabric. Capsules and
// cheap signed distance to each path create the ribbon bodies, while phase masks
// decide which colour visually sits on top.

export var speed = 0.42       // weave motion
export var width = 0.45       // ribbon width
export var count = 0.5        // number of active ribbon families
export var palette = 0.08     // base hue

export function sliderSpeed(v) { speed = v }
export function sliderWidth(v) { width = v }
export function sliderCount(v) { count = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var w, active

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.2 + speed * 1.6)
  w = 0.018 + width * 0.055
  active = 3 + floor(count * 3) // 3..6 ribbons
}

function ribbonDistance(x, y, i) {
  var lane = (i + 1) / (active + 1)
  var amp = 0.08 + 0.02 * i
  var yy = lane + amp * sin(x * PI2 * (1.2 + i * 0.17) + t * (0.8 + i * 0.11))
  return abs(y - yy) - w
}

export function render2D(index, x, y) {
  var val = 0
  var hue = palette
  var sat = 0.9

  for (var i = 0; i < 6; i = i + 1) {
    if (i < active) {
      var d = ribbonDistance(x, y, i)
      var body = SDF.fillGlow(d, 0.06)
      var edge = SDF.glow(d, 0.012)
      var weave = triangle(x * (3 + i) + t * 0.18 + i * 0.27)
      var over = weave > 0.5 ? 1.15 : 0.72
      var c = body * over + edge * 0.3
      if (c > val) {
        val = c
        hue = frac(palette + i * 0.145 + weave * 0.05)
        sat = 0.82 + edge * 0.18
      }
    }
  }

  // Subtle loom threads in the background.
  var thread = 0.08 * triangle(x * 18 + t * 0.05) * triangle(y * 14 - t * 0.04)
  hsv(hue, sat, clamp(val + thread, 0, 1))
}
