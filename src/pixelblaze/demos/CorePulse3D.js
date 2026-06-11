// Core Pulse 3D — concentric energy shells expanding through a volume.
//
// The whole effect is distance-from-centre plus a few dot-product waves, so it
// is intentionally tractable on Pixelblaze while still reading as volumetric.

export var speed = 0.04       // pulse rate
export var shellCount = 0.42  // shell density
export var coreSize = 0.62    // central glow radius
export var hue = 0.58         // base colour

export function sliderSpeed(v) { speed = v }
export function sliderShellCount(v) { shellCount = v }
export function sliderCoreSize(v) { coreSize = v }
export function sliderHue(v) { hue = v }

export var t = 0
var shells, coreR

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.25 + speed * 1.8)
  shells = 4 + shellCount * 13
  coreR = 0.08 + coreSize * 0.22
}

export function render3D(index, x, y, z) {
  var px = x - 0.5, py = y - 0.5, pz = z - 0.5
  var r = hypot3(px, py, pz)
  var wavefront = abs(triangle(r * shells - t * 0.55) - 0.5) * 2
  var shell = clamp(1 - wavefront * 7, 0, 1)
  shell = shell * shell

  var core = clamp(1 - r / coreR, 0, 1)
  core = core * core

  // A moving plane adds directional shimmer without noise.
  var plane = triangle(px * 1.7 + py * -0.9 + pz * 1.2 + t * 0.2)
  var val = clamp(core * 1.2 + shell * (0.82 + plane * 0.6) + 0.015, 0, 1)
  hsv(frac(hue + r * 0.35 + t * 0.02), 0.86 - core * 0.45, val)
}
