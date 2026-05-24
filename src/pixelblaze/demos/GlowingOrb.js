// A pulsing orb that cycles through hues, powered by SDF.circle and SDF.fillGlow

export var t

export function beforeRender(delta) {
  t = time(0.06)
}

export function render2D(index, x, y) {
  var r = 0.15 + 0.07 * wave(t)
  var d = SDF.circle(x, y, 0.5, 0.5, r)
  hsv(t, 0.9, SDF.fillGlow(d, 0.15))
}
