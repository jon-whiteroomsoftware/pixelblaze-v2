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
var active, falloff

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.18 + speed * 1.7)
  active = 3 + floor(traffic * 5)
  falloff = 10 + tail * 36
}

function trainPhase(i) {
  var dir = (i % 2 == 0) ? 1 : -1
  return frac(t * (0.12 + i * 0.017) * dir + i * 0.137)
}

export function render(index) {
  var pos = index / (pixelCount - 1)
  var val = 0
  var hue = palette

  for (var i = 0; i < 8; i = i + 1) {
    if (i < active) {
      var p = trainPhase(i)
      var d = abs(pos - p)
      d = min(d, 1 - d)
      var train = clamp(1 - d * falloff, 0, 1)
      train = train * train
      if (train > val) {
        val = train
        hue = frac(palette + i * 0.11 + train * 0.05)
      }
    }
  }

  // Station markers glow when trains pass the quarter points.
  var station = 0
  var s0 = abs(pos - 0.25), s1 = abs(pos - 0.50), s2 = abs(pos - 0.75)
  station = max(station, clamp(1 - min(s0, min(s1, s2)) * 80, 0, 1) * 0.18)
  hsv(hue, 0.85 - station, clamp(val + station, 0, 1))
}
