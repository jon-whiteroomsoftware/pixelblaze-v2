// SDF playground — orbiting shapes with controls
// Uses: SDF.smoothUnion, SDF.circle, SDF.star, SDF.ring, SDF.fillGlow

export var speed = 0.5
export var edgeBlur = 0.3
export var orbitDist = 0.3
export var starMode = 0
export var hue = 0
export var saturation = 1
export var brightness = 1

export function sliderSpeed(v) { speed = v }
export function sliderEdgeBlur(v) { edgeBlur = v }
export function sliderOrbitDist(v) { orbitDist = v }
export function toggleStarMode(v) { starMode = v }
export function hsvPickerColor(h, s, v) { hue = h; saturation = s; brightness = v }

// The orbit geometry (centres, radii, edge falloff) is identical for every
// pixel in a frame — only the SDF distance to it varies. Lift the 4 trig calls
// and the orbit math into beforeRender; render2D just samples the field.
var cx1, cy1, cx2, cy2, orbit, r, falloff

export function beforeRender(delta) {
  var t = time(0.1 * (speed * 2 + 0.1))
  var angle = t * PI * 2

  orbit = orbitDist * 0.45
  r = orbit * 0.55

  cx1 = 0.5 + cos(angle) * orbit
  cy1 = 0.5 + sin(angle) * orbit
  cx2 = 0.5 + cos(angle + PI) * orbit
  cy2 = 0.5 + sin(angle + PI) * orbit

  falloff = edgeBlur * edgeBlur * 0.3 + 0.005
}

export function render2D(index, x, y) {
  var d
  if (starMode) {
    var s1 = SDF.star(x, y, cx1, cy1, r, 5, 0.45)
    var s2 = SDF.ring(x, y, cx2, cy2, r * 0.8, r * 0.15)
    d = SDF.smoothUnion(s1, s2, orbit * 0.2)
  } else {
    var c1 = SDF.circle(x, y, cx1, cy1, r)
    var c2 = SDF.circle(x, y, cx2, cy2, r * 0.8)
    d = SDF.smoothUnion(c1, c2, orbit * 0.25)
  }

  var lit = SDF.fillGlow(d, falloff)
  hsv(hue + d * 0.3, saturation, lit * brightness)
}
