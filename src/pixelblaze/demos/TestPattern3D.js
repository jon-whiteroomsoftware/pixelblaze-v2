// Test Pattern (3D): verifies the third axis. Each coordinate drives one color
// channel — red = x, green = y, blue = z — so orientation reads directly off
// the RGB color cube. A bright plane sweeps along z to confirm depth ordering.

export var t

export function beforeRender(delta) {
  t = time(0.1)
}

export function render3D(index, x, y, z) {
  var sweep = clamp(1 - abs(z - t) * 8, 0, 1)
  rgb(max(x, sweep), max(y, sweep), max(z, sweep))
}
