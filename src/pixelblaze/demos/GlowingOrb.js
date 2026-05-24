// A pulsing orb that cycles through hues, powered by SDF.circle

export var t

export function beforeRender(delta) {
  t = time(0.06)
}

export function render2D(index, x, y) {
  var r = 0.15 + 0.07 * wave(t)
  var d = SDF.circle(x - 0.5, y - 0.5, r)
  var glow = clamp(1 - d * 6, 0, 1)
  hsv(t, 0.9, glow * glow)
}
