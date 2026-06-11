// Neon Circuit Board — pulsing traces, vias, and packet glints.
//
// Built from repeated coordinates plus cheap axis/diagonal distances. The first
// draft used true SDF capsules/circles; these approximations keep the circuit
// look and avoid several hypot calls per pixel.

export var speed = 0.62       // packet speed
export var density = 0.08     // cell density
export var pulse = 0.85       // packet brightness
export var hue = 0.43         // trace colour

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderPulse(v) { pulse = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cells, w, packetGain

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.22 + speed * 1.8)
  cells = 4 + floor(density * 7)
  w = 0.018 + density * 0.002
  packetGain = 0.25 + pulse * 0.75
}

export function render2D(index, x, y) {
  var gx = frac(x * cells)
  var gy = frac(y * cells)
  var id = floor(x * cells) + floor(y * cells) * 7

  var h = abs(gy - 0.50) - w
  var v = abs(gx - 0.50) - w * 0.82
  var d1 = abs((gy - 0.18) - (gx - 0.12) * 0.86) - w * 0.65
  var d2 = abs((gy - 0.84) + (gx - 0.18) * 1.06) - w * 0.55
  var route = min(min(h, v), min(d1, d2))

  var trace = clamp(1 - abs(route) * 12.5, 0, 1)
  var via0 = max(abs(gx - 0.50), abs(gy - 0.50))
  var via1 = max(abs(gx - 0.12), abs(gy - 0.18))
  var via = max(clamp(1 - via0 * 18, 0, 1), clamp(1 - via1 * 22, 0, 1))

  var packet = triangle(gx + gy + t * 0.28 + id * 0.137)
  packet = packet * packet * packet * packetGain

  var val = clamp(trace * (0.28 + packet) + via * 0.5, 0, 1)
  hsv(frac(hue + id * 0.021 + packet * 0.05), 0.9 - via * 0.22, val)
}
