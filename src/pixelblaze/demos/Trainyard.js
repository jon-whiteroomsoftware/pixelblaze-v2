// Trainyard (1D) — pulses running on virtual tracks and switching at junctions.
//
// A strip cannot show real 2D rails, so this fakes a busy rail yard with several
// modular pulse lanes, switch points, and a station flash when trains meet.

export var speed = 0.45       // train speed
export var traffic = 0.55     // number of active trains
export var tail = 0.45        // trail length
export var palette = 0.08     // base hue

export function sliderSpeed(v) { speed = v }
export function sliderTraffic(v) { traffic = v }
export function sliderTail(v) { tail = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var active, falloff, invPixels
var p0, p1, p2, p3, p4, p5

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.18 + speed * 1.7)
  active = 3 + floor(traffic * 4)
  falloff = 10 + tail * 36
  invPixels = 1 / (pixelCount - 1)
  // Train heads are frame-constant. Precomputing them avoids repeated frac and
  // direction math for every LED while preserving the crossing-route feel.
  p0 = frac(t * 0.120)
  p1 = frac(t * -0.137 + 0.137)
  p2 = frac(t * 0.154 + 0.274)
  p3 = frac(t * -0.171 + 0.411)
  p4 = frac(t * 0.188 + 0.548)
  p5 = frac(t * -0.205 + 0.685)
}

export function render(index) {
  var pos = index * invPixels
  var d = abs(pos - p0); d = min(d, 1 - d)
  var val = clamp(1 - d * falloff, 0, 1)
  var hue = palette

  d = abs(pos - p1); d = min(d, 1 - d)
  var train = clamp(1 - d * falloff, 0, 1)
  if (train > val) { val = train; hue = palette + 0.11 }

  d = abs(pos - p2); d = min(d, 1 - d)
  train = clamp(1 - d * falloff, 0, 1)
  if (train > val) { val = train; hue = palette + 0.22 }

  if (active > 3) {
    d = abs(pos - p3); d = min(d, 1 - d)
    train = clamp(1 - d * falloff, 0, 1)
    if (train > val) { val = train; hue = palette + 0.33 }
  }

  if (active > 4) {
    d = abs(pos - p4); d = min(d, 1 - d)
    train = clamp(1 - d * falloff, 0, 1)
    if (train > val) { val = train; hue = palette + 0.44 }
  }

  if (active > 5) {
    d = abs(pos - p5); d = min(d, 1 - d)
    train = clamp(1 - d * falloff, 0, 1)
    if (train > val) { val = train; hue = palette + 0.55 }
  }

  val = val * val

  // Station markers glow when trains pass the quarter points.
  var s0 = abs(pos - 0.25), s1 = abs(pos - 0.50), s2 = abs(pos - 0.75)
  var station = clamp(1 - min(s0, min(s1, s2)) * 80, 0, 1) * 0.18
  hsv(frac(hue + val * 0.05), 0.85 - station, clamp(val + station, 0, 1))
}
