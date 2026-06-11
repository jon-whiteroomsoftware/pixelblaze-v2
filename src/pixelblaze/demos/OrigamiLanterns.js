// Origami Lanterns — folded paper lights with warm seams and inner glow.
//
// Triangle and diamond SDFs make paper-like facets without texture or noise. The
// animation is mostly frame-constant wobble, so the per-pixel work stays small.

export var speed = 0.34       // lantern drift
export var fold = 0.55        // seam strength
export var glow = 0.66        // inner lantern brightness
export var hue = 0.08         // paper-light colour

export function sliderSpeed(v) { speed = v }
export function sliderFold(v) { fold = v }
export function sliderGlow(v) { glow = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cx0, cy0, cx1, cy1, cx2, cy2, seamGain

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.25)
  cx0 = 0.24 + 0.05 * triangle(t * 0.11)
  cy0 = 0.34 + 0.05 * triangle(t * 0.16)
  cx1 = 0.69 + 0.04 * triangle(t * 0.14 + 0.3)
  cy1 = 0.45 + 0.06 * triangle(t * 0.10 + 0.7)
  cx2 = 0.47 + 0.06 * triangle(t * 0.09 + 0.5)
  cy2 = 0.72 + 0.04 * triangle(t * 0.13 + 0.2)
  seamGain = 0.35 + fold * 0.75
}

function lantern(x, y, cx, cy, r, phase) {
  var dx = x - cx, dy = y - cy
  var diamond = abs(dx) + abs(dy * 1.35) - r
  var body = clamp(0.5 - diamond / 0.035, 0, 1)
  var rim = clamp(1 - abs(diamond) / 0.026, 0, 1)
  var seams = triangle((dx + dy) * 6 + phase) * triangle((dx - dy) * 6 - phase)
  var core = clamp(1 - (dx * dx + dy * dy * 1.4) / (r * r * 0.55), 0, 1)
  return body * (core * glow + seams * seamGain * 0.28) + rim * 0.55
}

export function render2D(index, x, y) {
  var a = lantern(x, y, cx0, cy0, 0.20, t * 0.12)
  var b = lantern(x, y, cx1, cy1, 0.23, t * -0.10 + 0.4)
  var c = 0
  // The small lower lantern only contributes in its band; culling it elsewhere
  // saves a full lantern evaluation over most pixels.
  if (y > 0.50) c = lantern(x, y, cx2, cy2, 0.18, t * 0.15 + 0.8)
  var val = max(a, max(b, c))
  var string = clamp(1 - abs(x - 0.5) / 0.008, 0, 1) * 0.08
  hsv(frac(hue + y * 0.08 + val * 0.04), 0.78, clamp(val + string, 0, 1))
}
