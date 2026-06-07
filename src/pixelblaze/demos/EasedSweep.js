// A color sweep that glides back and forth with eased motion using Anim.easeInOut2

export var t
// Sweep position and its hue are frame-constant (depend only on t) — compute
// once per frame in beforeRender instead of re-running wave+ease for every pixel.
var pos, hue

export function beforeRender(delta) {
  t = time(0.08)
  pos = Anim.easeInOut2(wave(t))
  hue = pos * 0.5
}

export function render2D(index, x, y) {
  var d = abs(x - pos)
  var brightness = clamp(1 - d * 8, 0, 1)
  hsv(hue, 1, brightness)
}
