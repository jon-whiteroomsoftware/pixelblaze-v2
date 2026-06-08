// Gyroid Glow 3D — a cheap triply-periodic surface field.
//
// Gyroids look volumetric and complex, but the field is only a few sin/cos
// terms. No raymarch, no noise, no fBm: just a glowing isosurface through space.

export var speed = 0.35      // field drift
export var scale = 0.45      // cell density
export var thickness = 0.45  // surface thickness
export var color = 0.73      // base hue

export function sliderSpeed(v) { speed = v }
export function sliderScale(v) { scale = v }
export function sliderThickness(v) { thickness = v }
export function sliderColor(v) { color = v }

export var t = 0
var s, thick

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.2 + speed * 1.4)
  s = 5 + scale * 14
  thick = 0.12 + thickness * 0.38
}

export function render3D(index, x, y, z) {
  var px = (x - 0.5) * s + t * 0.4
  var py = (y - 0.5) * s - t * 0.31
  var pz = (z - 0.5) * s + t * 0.23

  var g = sin(px) * cos(py) + sin(py) * cos(pz) + sin(pz) * cos(px)
  var surf = clamp(1 - abs(g) / thick, 0, 1)
  surf = surf * surf * (3 - 2 * surf)

  var ribs = clamp(1 - abs(sin(px + py + pz) * 0.7) / 0.38, 0, 1) * 0.25
  var val = clamp(surf + ribs * surf, 0, 1)
  hsv(frac(color + g * 0.08 + z * 0.2), 0.9, val)
}
