// Test Pattern (1D): verifies strip order, direction, and index range.
// A hue ramp paints index 0 -> last across the spectrum so pixel order reads at
// a glance, while a bright white comet sweeps from the first pixel toward the
// last to confirm the direction of travel.

export var t

export function beforeRender(delta) {
  t = time(0.1)
}

export function render(index) {
  var pos = index / (pixelCount - 1)   // 0 at the first pixel, 1 at the last
  var head = t                         // comet head sweeps 0 -> 1
  var comet = clamp(1 - abs(pos - head) * 12, 0, 1)
  // Hue ramp shows index order; the white comet shows direction of travel.
  hsv(pos, 1 - comet, max(0.15, comet))
}
