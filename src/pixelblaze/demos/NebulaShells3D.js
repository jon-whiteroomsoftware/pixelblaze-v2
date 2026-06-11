// Nebula Shells 3D — slow spherical auroras inside a volume.
//
// Instead of volumetric noise, this uses nested shell distances with a little
// phase wobble, which stays tractable on large 3D previews and hardware.

export var speed = 0.34       // shell drift
export var shellCount = 1     // shell density
export var thickness = 1      // shell thickness
export var color = 0.07       // base hue

export function sliderSpeed(v) { speed = v }
export function sliderShellCount(v) { shellCount = v }
export function sliderThickness(v) { thickness = v }
export function sliderColor(v) { color = v }

export var t = 0
var bands, thick

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.10 + speed * 1.15)
  bands = 4 + shellCount * 12
  thick = 0.11 + thickness * 0.28
}

export function render3D(index, x, y, z) {
  var dx = x - 0.5, dy = y - 0.5, dz = z - 0.5
  var r = hypot(hypot(dx, dy), dz)
  var wobble = triangle((x + y - z) * 2.2 + t * 0.08) * 0.08
  var shell = triangle((r + wobble - t * 0.035) * bands)
  var val = clamp(1 - abs(shell - 0.5) / thick, 0, 1)
  val = val * val * clamp(1.25 - r * 1.45, 0, 1)
  hsv(frac(color + r * 0.45 + z * 0.10 + t * 0.012), 0.86, val)
}
