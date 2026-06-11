// Heat Shimmer Tiles — repeated colour panes bending under a slow heat haze.
//
// The shimmer is just coordinate offsets from triangle waves. No perlin needed.

export var speed = 0.57       // shimmer speed
export var tileSize = 0.50    // tile density
export var shimmer = 0.62     // bend amount
export var palette = 0.04     // base heat colour

export function sliderSpeed(v) { speed = v }
export function sliderTileSize(v) { tileSize = v }
export function sliderShimmer(v) { shimmer = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var cells, bend

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.35)
  cells = 5 + floor(tileSize * 9)
  bend = 0.025 + shimmer * 0.065
}

export function render2D(index, x, y) {
  var sx = x + (triangle(y * 4.0 + t * 0.22) - 0.5) * bend
  var sy = y + (triangle(x * 3.2 - t * 0.17) - 0.5) * bend
  var gx = frac(sx * cells)
  var gy = frac(sy * cells)
  var edge = max(clamp(1 - min(gx, 1 - gx) * 18, 0, 1),
                 clamp(1 - min(gy, 1 - gy) * 18, 0, 1))
  var warmth = triangle(gx * 0.8 + gy * 1.1 + t * 0.05)
  var val = clamp(0.18 + warmth * 0.45 + edge * 0.26, 0, 1)
  hsv(frac(palette + warmth * 0.12 + y * 0.08), 0.86 - edge * 0.25, val)
}
