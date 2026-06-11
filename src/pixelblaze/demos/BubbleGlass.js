// Bubble Glass — drifting translucent rings in a stripe-lit pane.
//
// A fixed set of ring SDFs plus a simple stripe field gives a glossy, refractive
// feel without needing actual refraction.

export var speed = 0.32       // bubble drift
export var bubbles = 0.62     // active bubble count
export var shine = 0.58       // highlight strength
export var tint = 0.52        // glass tint

export function sliderSpeed(v) { speed = v }
export function sliderBubbles(v) { bubbles = v }
export function sliderShine(v) { shine = v }
export function sliderTint(v) { tint = v }

export var t = 0
var active
var x0, y0, x1, y1, x2, y2, x3, y3

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.10 + speed * 1.1)
  active = 2 + floor(bubbles * 2)
  x0 = 0.22 + 0.09 * triangle(t * 0.16)
  y0 = 0.34 + 0.12 * triangle(t * 0.11 + 0.2)
  x1 = 0.66 + 0.11 * triangle(t * 0.13 + 0.4)
  y1 = 0.28 + 0.10 * triangle(t * 0.15 + 0.6)
  x2 = 0.43 + 0.10 * triangle(t * 0.10 + 0.8)
  y2 = 0.65 + 0.13 * triangle(t * 0.12 + 0.3)
  x3 = 0.76 + 0.08 * triangle(t * 0.18 + 0.1)
  y3 = 0.72 + 0.09 * triangle(t * 0.09 + 0.7)
}

function bubble(x, y, cx, cy, r) {
  var ring = SDF.glow(SDF.ring(x, y, cx, cy, r, 0.026), 0.040)
  var hi = clamp(1 - max(abs(x - (cx - r * 0.30)), abs(y - (cy - r * 0.28))) / (r * 0.22), 0, 1)
  return ring * (0.55 + shine * 0.45) + hi * shine * 0.55
}

export function render2D(index, x, y) {
  var stripes = triangle((x + y * 0.35) * 7 + t * 0.04) * 0.12
  var val = bubble(x, y, x0, y0, 0.15)
  val = max(val, bubble(x, y, x1, y1, 0.19))
  if (active > 2) val = max(val, bubble(x, y, x2, y2, 0.17))
  if (active > 3) val = max(val, bubble(x, y, x3, y3, 0.13))
  hsv(frac(tint + val * 0.06 + stripes * 0.15), 0.55 + val * 0.28, clamp(val + stripes, 0, 1))
}
