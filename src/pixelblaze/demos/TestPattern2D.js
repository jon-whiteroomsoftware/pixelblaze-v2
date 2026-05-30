// Test Pattern (2D): verifies grid orientation and the X / Y coordinate axes.
// Red rises with x (left -> right) and green rises with y (bottom -> top), so
// each corner is a known color: (0,0) black, (1,0) red, (0,1) green, (1,1)
// yellow. A white dot orbits the centre to confirm animation and aspect ratio.

export var t

export function beforeRender(delta) {
  t = time(0.1)
}

export function render2D(index, x, y) {
  var px = 0.5 + 0.35 * cos(t * PI * 2)
  var py = 0.5 + 0.35 * sin(t * PI * 2)
  var dot = clamp(1 - hypot(x - px, y - py) * 12, 0, 1)
  rgb(max(x, dot), max(y, dot), dot)
}
