// Crystal Rain 3D — falling rods and droplets through a cubic volume.
//
// Repeated X/Z columns and vertical triangle phases create a rain field with no
// arrays. It reads well in 3D previews and still produces useful FPS on hardware.

export var speed = 0.64       // fall speed
export var density = 0.42     // column density
export var length = 0.66      // droplet length
export var hue = 0.55         // crystal colour

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderLength(v) { length = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cells, rodLen

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.14 + speed * 1.5)
  cells = 4 + floor(density * 6)
  rodLen = 0.13 + length * 0.32
}

export function render3D(index, x, y, z) {
  var gx = frac(x * cells) - 0.5
  var gz = frac(z * cells) - 0.5
  var id = floor(x * cells) + floor(z * cells) * 13
  var col = clamp(1 - max(abs(gx), abs(gz)) * 5.4, 0, 1)
  var halo = clamp(1 - max(abs(gx), abs(gz)) * 2.5, 0, 1)
  var phase = frac(y + t * (0.18 + id * 0.004) + id * 0.071)
  var drop = clamp(1 - min(phase, 1 - phase) / rodLen, 0, 1)
  var sparkle = triangle(id * 0.137 + t * 0.18) * 0.46
  var glint = drop * drop
  var val = halo * (0.06 + drop * 0.16) + col * (drop * (0.98 + sparkle) + 0.11) + glint * 0.12
  var colorLift = sparkle * 0.10 + glint * 0.055
  hsv(frac(hue + y * 0.28 + id * 0.031 + colorLift), 0.76 + glint * 0.18, clamp(val, 0, 1))
}
