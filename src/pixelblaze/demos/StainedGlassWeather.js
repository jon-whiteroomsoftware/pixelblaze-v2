// Stained Glass Weather — leaded panes with rain and lightning pulses.
//
// Repeated cells and cheap borders do most of the work. The "weather" is a few
// triangle-wave streaks and a global flash, not noise or particle state.

export var speed = 0.41       // weather motion speed
export var paneSize = 0.47    // glass cell density
export var storm = 0.72       // rain/lightning strength
export var tint = 0.90        // base glass colour

export function sliderSpeed(v) { speed = v }
export function sliderPaneSize(v) { paneSize = v }
export function sliderStorm(v) { storm = v }
export function sliderTint(v) { tint = v }

export var t = 0
var cells, lead, flash

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.4)
  cells = 4 + floor(paneSize * 7)
  lead = 0.035 + paneSize * 0.012
  flash = max(0, triangle(t * 0.21) - 0.86) * storm * 5.2
}

export function render2D(index, x, y) {
  var gx = frac(x * cells)
  var gy = frac(y * cells)
  var id = floor(x * cells) + floor(y * cells) * 9
  var border = max(clamp(1 - min(gx, 1 - gx) / lead, 0, 1),
                   clamp(1 - min(gy, 1 - gy) / lead, 0, 1))

  var rain = clamp(1 - abs(triangle((gx + gy * 0.45) * 3.2 + t * 0.42 + id * 0.17) - 0.5) * 5.4, 0, 1)
  rain = rain * storm * (1 - border)
  var glass = 0.18 + triangle(id * 0.137 + t * 0.025) * 0.22
  var val = clamp(glass + rain * 0.55 + border * 0.42 + flash, 0, 1)
  hsv(frac(tint + id * 0.031 + rain * 0.05), 0.72 - border * 0.25, val)
}
