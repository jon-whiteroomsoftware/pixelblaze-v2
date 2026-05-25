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

export function render2D(index, x, y) {
  var t = time(0.1 * (speed * 2 + 0.1))
  var angle = t * PI * 2

  var orbit = orbitDist * 0.45
  var r = orbit * 0.55

  var cx1 = 0.5 + cos(angle) * orbit
  var cy1 = 0.5 + sin(angle) * orbit
  var cx2 = 0.5 + cos(angle + PI) * orbit
  var cy2 = 0.5 + sin(angle + PI) * orbit

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

  var falloff = edgeBlur * edgeBlur * 0.3 + 0.005
  var lit = SDF.fillGlow(d, falloff)
  hsv(hue + d * 0.3, saturation, lit * brightness)
}
