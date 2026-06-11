// Eclipse Factory — moving moons cut crescents through a glowing sun.
//
// Layered circle/ellipse SDFs make big dramatic shapes from very little math.

export var speed = 0.35       // orbital speed
export var moonSize = 0.48    // size of the eclipsing bodies
export var corona = 0.7       // halo brightness
export var hue = 0.09         // solar hue

export function sliderSpeed(v) { speed = v }
export function sliderMoonSize(v) { moonSize = v }
export function sliderCorona(v) { corona = v }
export function sliderHue(v) { hue = v }

export var t = 0
var mx0, my0, mx1, my1, moonR, halo

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.12 + speed * 1.2)
  moonR = 0.13 + moonSize * 0.22
  halo = 0.12 + corona * 0.22
  mx0 = 0.5 + 0.42 * cos(t * 0.64)
  my0 = 0.5 + 0.19 * sin(t * 0.64)
  mx1 = 0.5 + 0.36 * cos(t * -0.41 + 2.4)
  my1 = 0.5 + 0.25 * sin(t * 0.57 + 1.2)
}

export function render2D(index, x, y) {
  var sun = SDF.circle(x, y, 0.5, 0.5, 0.31)
  var oval = SDF.ellipse(x, y, 0.5, 0.5, 0.43, 0.29)
  var moon0 = SDF.circle(x, y, mx0, my0, moonR)
  var moon1 = SDF.circle(x, y, mx1, my1, moonR * 0.78)
  var shade = min(moon0, moon1)

  var disk = SDF.softFill(max(sun, -shade), 0.025)
  var ring = SDF.glow(sun, 0.028)
  var outer = SDF.glow(oval, halo) * (0.28 + corona * 0.7)
  var shadowRim = SDF.glow(shade, 0.02) * SDF.softFill(sun, 0.07)
  var val = clamp(outer * 0.45 + disk + ring * 0.55 + shadowRim * 0.45, 0, 1)

  hsv(frac(hue + outer * 0.08 + shadowRim * 0.04), 0.92 - disk * 0.2, val)
}
