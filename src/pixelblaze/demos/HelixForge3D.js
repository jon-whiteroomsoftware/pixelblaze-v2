// Helix Forge 3D — braided coils winding through the volume.
//
// The coils are analytic distances to moving helix centre-lines. It reads like
// 3D sculpture without raymarching.

export var speed = 0.42       // coil rotation speed
export var twist = 0.55       // helix turn count
export var radius = 0.62      // braid radius
export var hue = 0.04         // metal/glow hue

export function sliderSpeed(v) { speed = v }
export function sliderTwist(v) { twist = v }
export function sliderRadius(v) { radius = v }
export function sliderHue(v) { hue = v }

export var t = 0
var turns, coilR, thick

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.5)
  turns = 2.0 + twist * 5.0
  coilR = 0.15 + radius * 0.22
  thick = 0.055 + radius * 0.038
}

function helixGlow(x, y, z, phase) {
  var a = z * turns * PI * 2 + t + phase
  var cx = 0.5 + coilR * cos(a)
  var cy = 0.5 + coilR * sin(a)
  var dx = x - cx, dy = y - cy
  return clamp(1 - (dx * dx + dy * dy) / (thick * thick), 0, 1)
}

export function render3D(index, x, y, z) {
  var h0 = helixGlow(x, y, z, 0)
  var h1 = helixGlow(x, y, z, PI * 0.67)
  var h2 = helixGlow(x, y, z, PI * 1.34) * 0.75
  var core = clamp(1 - ((x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5)) / 0.024, 0, 1) * 0.28
  var val = clamp(max(h0, max(h1, h2)) * 1.18 + core + 0.018, 0, 1)
  val = val * val * (3 - 2 * val)

  hsv(frac(hue + z * 0.28 + val * 0.06), 0.88, val)
}
