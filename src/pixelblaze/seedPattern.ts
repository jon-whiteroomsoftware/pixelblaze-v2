export const SEED_PATTERN = `\
// Rainbow ripple — seed pattern
// Demonstrates most Pixelblaze language features

// export var declarations become UI sliders/knobs
export var speed = 0.5     // [0, 1]  animation speed
export var spread = 3.0    // [1, 8]  wave count across strip
export var hueBase = 0.0   // [0, 1]  base hue offset
export var sat = 1.0       // [0, 1]  saturation
export var brightness = 1.0 // [0, 1] peak brightness

// Private frame-level state
var t1, t2, t3

// beforeRender is called once per frame, before any pixels are rendered.
// delta is elapsed milliseconds since the previous frame.
function beforeRender(delta) {
  t1 = time(0.05 * speed)   // sawtooth 0–1, ~20 s period at speed=1
  t2 = time(0.13 * speed)   // faster sawtooth for pulse
  t3 = time(0.03 * speed)   // slow drift for hue rotation
}

// render is called once per pixel per frame.
// index is the 0-based position of the pixel along the strip.
function render(index) {
  var pct = index / pixelCount        // normalised 0–1 position

  // Waveforms
  var ripple  = wave(pct * spread + t1)        // travelling sine ripple
  var pulse   = triangle(t2)                   // slow brightness envelope
  var shimmer = square(t3 + pct * 0.1, 0.4)   // 40 % duty-cycle flash

  // Colour
  var h = hueBase + pct * 0.55 + t3 + ripple * 0.12
  var s = sat * (1 - ripple * 0.2)             // desaturate at peak
  var v = ripple * pulse * brightness
  v = clamp(v + shimmer * 0.08, 0, brightness)

  hsv(h, s, v)
}

// ── 2D variant ──────────────────────────────────────────────────────────────
// Uncomment when using a 2D LED matrix.
// render2D receives normalised x and y coordinates (0–1) in addition to index.

/*
function render2D(index, x, y) {
  var cx = 0.5, cy = 0.5
  var dx = x - cx,  dy = y - cy

  // sdf.circle returns a signed distance: negative inside, positive outside
  var d   = sdf.circle(dx, dy, wave(t1) * 0.4 + 0.05)
  var rim = clamp(1 - abs(d) * 6, 0, 1)

  // Hue follows polar angle around centre
  var angle = atan2(dy, dx)
  var h = hueBase + t3 + angle / (PI * 2)
  var v = rim * triangle(t2) * brightness

  hsv(h, sat, clamp(v, 0, 1))
}
*/

// ── Noise example ────────────────────────────────────────────────────────────
// The noise library provides smooth random fields.

/*
function render(index) {
  var pct = index / pixelCount
  var n = noise.perlin(pct * 4 + t1, t2)  // -1 to 1
  var v = clamp((n + 1) * 0.5, 0, 1)      // remap to 0–1
  hsv(hueBase + pct * 0.3 + t3, sat, v * brightness)
}
*/
`
