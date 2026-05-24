// A color sweep that glides back and forth with eased motion using Anim.easeInOut

export var t

export function beforeRender(delta) {
  t = time(0.08)
}

export function render2D(index, x, y) {
  var pos = Anim.easeInOut(wave(t))
  var d = abs(x - pos)
  var brightness = clamp(1 - d * 8, 0, 1)
  hsv(pos * 0.5, 1, brightness)
}
