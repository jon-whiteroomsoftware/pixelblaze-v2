// Comet Loom (1D) — long-tailed comets weaving through a slow base rhythm.
//
// The comet heads are precomputed once per frame; each LED only compares a small
// fixed set of distances, keeping the strip version controller-friendly.

export var speed = 0.42       // comet speed
export var comets = 0.55      // active comet count
export var tail = 0.68        // tail length
export var palette = 0.70     // base hue

export function sliderSpeed(v) { speed = v }
export function sliderComets(v) { comets = v }
export function sliderTail(v) { tail = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var active, falloff, invPixels
var p0, p1, p2, p3, p4

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.45)
  active = 3 + floor(comets * 3)
  falloff = 7 + (1 - tail) * 32
  invPixels = 1 / (pixelCount - 1)
  p0 = frac(t * 0.070)
  p1 = frac(t * -0.091 + 0.21)
  p2 = frac(t * 0.112 + 0.43)
  p3 = frac(t * -0.133 + 0.64)
  p4 = frac(t * 0.154 + 0.82)
}

function comet(pos, p) {
  var d = abs(pos - p)
  d = min(d, 1 - d)
  var v = clamp(1 - d * falloff, 0, 1)
  return v * v
}

export function render(index) {
  var pos = index * invPixels
  var val = comet(pos, p0)
  var hue = palette
  var v = comet(pos, p1)
  if (v > val) { val = v; hue = palette + 0.13 }
  v = comet(pos, p2)
  if (v > val) { val = v; hue = palette + 0.26 }
  if (active > 3) {
    v = comet(pos, p3)
    if (v > val) { val = v; hue = palette + 0.39 }
  }
  if (active > 4) {
    v = comet(pos, p4)
    if (v > val) { val = v; hue = palette + 0.52 }
  }
  var base = triangle(pos * 3 - t * 0.035) * 0.10
  hsv(frac(hue + val * 0.06), 0.86, clamp(val + base, 0, 1))
}
