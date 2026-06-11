// Voxel Fireflies 3D — glowing insects in repeated volume cells.
//
// A deterministic cell hash places one animated light in each occupied cell.
// No arrays or particle state, just repeated coordinates and distance falloff.

export var speed = 0.92       // drift speed
export var density = 0.46     // number of cells
export var glow = 0.89        // falloff size
export var color = 0.23       // base hue

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderGlow(v) { glow = v }
export function sliderColor(v) { color = v }

export var t = 0
var cells, falloff

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.4)
  cells = 3 + floor(density * 6)
  falloff = 0.030 + glow * 0.090
}

function hash(n) {
  return frac(sin(n * 12.9898) * 43758.5453)
}

export function render3D(index, x, y, z) {
  var ix = floor(x * cells), iy = floor(y * cells), iz = floor(z * cells)
  var id = ix + iy * 17 + iz * 113
  var gx = frac(x * cells), gy = frac(y * cells), gz = frac(z * cells)

  var h0 = hash(id + 1), h1 = hash(id + 7), h2 = hash(id + 19)
  var cx = 0.5 + 0.28 * sin(t * (0.7 + h0) + h1 * PI * 2)
  var cy = 0.5 + 0.28 * sin(t * (0.6 + h1) + h2 * PI * 2)
  var cz = 0.5 + 0.28 * sin(t * (0.5 + h2) + h0 * PI * 2)

  var dx = gx - cx, dy = gy - cy, dz = gz - cz
  var d2 = dx * dx + dy * dy + dz * dz
  var blink = wave(t * (0.3 + h0 * 0.8) + h1)
  blink = blink * blink
  var val = clamp(1 - d2 / falloff, 0, 1) * (0.55 + blink * 0.95)

  hsv(frac(color + h0 * 0.16 + blink * 0.05), 0.78, clamp(val + 0.018, 0, 1))
}
