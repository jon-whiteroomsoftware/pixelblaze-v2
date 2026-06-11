// Metro Lines (1D) — coloured routes crossing a strip or ring.
//
// Several virtual lines run at different speeds, with station flashes where
// their pulses pass fixed stops.

export var speed = 0.42       // route speed
export var routes = 0.62      // active route count
export var stationGlow = 0.55 // brightness of stops
export var palette = 0.58     // base route hue

export function sliderSpeed(v) { speed = v }
export function sliderRoutes(v) { routes = v }
export function sliderStationGlow(v) { stationGlow = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var active, width, invPixels
var p0, p1, p2, p3, p4

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.5)
  active = 3 + floor(routes * 3)
  width = 18 + stationGlow * 16
  invPixels = 1 / (pixelCount - 1)
  // Route phases are frame-constant; hoisting them out of render() removes the
  // most expensive part of this 1D pattern's inner loop.
  p0 = frac(t * 0.080)
  p1 = frac(t * -0.101 + 0.171)
  p2 = frac(t * 0.122 + 0.342)
  p3 = frac(t * -0.143 + 0.513)
  p4 = frac(t * 0.164 + 0.684)
}

export function render(index) {
  var pos = index * invPixels
  var d = abs(pos - p0); d = min(d, 1 - d)
  var val = clamp(1 - d * width, 0, 1)
  var hue = palette

  d = abs(pos - p1); d = min(d, 1 - d)
  var p = clamp(1 - d * width, 0, 1)
  if (p > val) { val = p; hue = palette + 0.095 }

  d = abs(pos - p2); d = min(d, 1 - d)
  p = clamp(1 - d * width, 0, 1)
  if (p > val) { val = p; hue = palette + 0.190 }

  if (active > 3) {
    d = abs(pos - p3); d = min(d, 1 - d)
    p = clamp(1 - d * width, 0, 1)
    if (p > val) { val = p; hue = palette + 0.285 }
  }

  if (active > 4) {
    d = abs(pos - p4); d = min(d, 1 - d)
    p = clamp(1 - d * width, 0, 1)
    if (p > val) { val = p; hue = palette + 0.380 }
  }

  val = val * val

  var s = max(max(clamp(1 - abs(pos - 0.125) * 90, 0, 1),
                  clamp(1 - abs(pos - 0.375) * 90, 0, 1)),
              max(clamp(1 - abs(pos - 0.625) * 90, 0, 1),
                  clamp(1 - abs(pos - 0.875) * 90, 0, 1)))
  var station = s * (0.08 + stationGlow * 0.28)
  hsv(hue, 0.88 - station, clamp(val + station, 0, 1))
}
