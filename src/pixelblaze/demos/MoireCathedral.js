// Moire Cathedral — stained-glass arches from cheap crossing stripe fields.
//
// This leans on triangle waves, symmetry, and a few SDF masks instead of noise
// or raymarching. It should scale well because every layer is simple periodic
// math with frame-constant angles.

export var speed = 0.55       // motion rate
export var density = 0.30     // stripe density
export var bloom = 0.46       // glow brightness
export var arch = 0.61        // arch/window strength

export function sliderSpeed(v) { speed = v }
export function sliderDensity(v) { density = v }
export function sliderBloom(v) { bloom = v }
export function sliderArch(v) { arch = v }

export var t = 0
var c0, s0, c1, s1, c2, s2
var freq, gain, archMix

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.2 + speed * 1.5)
  var a0 = t * 0.19
  var a1 = -t * 0.13 + 1.7
  var a2 = t * 0.07 + 3.2
  c0 = cos(a0); s0 = sin(a0)
  c1 = cos(a1); s1 = sin(a1)
  c2 = cos(a2); s2 = sin(a2)
  freq = 8 + density * 26
  gain = 0.7 + bloom * 1.7
  archMix = arch
}

function stripe(px, py, c, s, phase) {
  var u = px * c + py * s
  var v = abs(triangle(u * freq + phase) - 0.5) * 2
  return clamp(1 - v * 5, 0, 1)
}

export function render2D(index, x, y) {
  var px = x - 0.5, py = y - 0.5
  var a = stripe(px, py, c0, s0, t * 0.11)
  var b = stripe(px, py, c1, s1, -t * 0.09)
  var c = stripe(px, py, c2, s2, t * 0.07)

  // Tall arched-window mask: rectangle body plus circular crown.
  var body = SDF.rect(x, y, 0.5, 0.58, 0.38, 0.38)
  var crown = SDF.circle(x, y, 0.5, 0.32, 0.38)
  var window = SDF.smoothUnion(body, crown, 0.08)
  var frame = SDF.glow(window, 0.035 + archMix * 0.035)
  var inside = SDF.softFill(window, 0.08)

  var glass = (a * b + b * c + c * a) * 0.45
  var lead = max(a, max(b, c)) * 0.22
  var val = clamp((glass + lead) * inside * gain + frame * archMix, 0, 1)
  var hue = frac(0.08 + a * 0.16 + b * 0.33 + c * 0.48 + t * 0.015)
  hsv(hue, 0.92 - frame * 0.35, val)
}
