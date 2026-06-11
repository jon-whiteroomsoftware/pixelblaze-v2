// Metaball Garden — soft luminous cells blooming into one another.
//
// Cheap inverse-square blobs give the impression of fluid merging without
// raymarching or noise. The only moving parts are five orbiting centres.

export var speed = 0.25       // drift speed
export var blobCount = 0.71   // number of active cells
export var softness = 0.77    // merge softness
export var palette = 0.34     // base hue

export function sliderSpeed(v) { speed = v }
export function sliderBlobCount(v) { blobCount = v }
export function sliderSoftness(v) { softness = v }
export function sliderPalette(v) { palette = v }

export var t = 0
var active, gain, threshold
var ax0, ay0, ax1, ay1, ax2, ay2, ax3, ay3, ax4, ay4

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.16 + speed * 1.4)
  active = 3 + floor(blobCount * 3)
  gain = 0.018 + softness * 0.038
  threshold = 1.55 - softness * 0.55

  ax0 = 0.50 + 0.28 * cos(t * 0.61)
  ay0 = 0.50 + 0.22 * sin(t * 0.79)
  ax1 = 0.50 + 0.31 * cos(t * -0.43 + 1.8)
  ay1 = 0.50 + 0.25 * sin(t * 0.52 + 2.6)
  ax2 = 0.50 + 0.18 * cos(t * 0.97 + 4.1)
  ay2 = 0.50 + 0.32 * sin(t * -0.69 + 0.4)
  ax3 = 0.50 + 0.34 * cos(t * 0.37 + 3.0)
  ay3 = 0.50 + 0.17 * sin(t * 1.10 + 1.2)
  ax4 = 0.50 + 0.21 * cos(t * -0.88 + 5.2)
  ay4 = 0.50 + 0.30 * sin(t * 0.34 + 4.6)
}

function blob(x, y, cx, cy, r) {
  var dx = x - cx, dy = y - cy
  return r / (gain + dx * dx + dy * dy)
}

export function render2D(index, x, y) {
  var f = blob(x, y, ax0, ay0, 0.080)
        + blob(x, y, ax1, ay1, 0.070)
        + blob(x, y, ax2, ay2, 0.065)
  if (active > 3) f = f + blob(x, y, ax3, ay3, 0.060)
  if (active > 4) f = f + blob(x, y, ax4, ay4, 0.058)

  var skin = clamp((f - threshold) * 0.72, 0, 1)
  var rim = clamp(1 - abs(f - threshold) * 1.8, 0, 1)
  var veins = wave(f * 0.13 + t * 0.07) * skin * 0.18
  var val = clamp(skin * skin + rim * 0.55 + veins, 0, 1)

  hsv(frac(palette + f * 0.008 + rim * 0.08), 0.82 - rim * 0.22, val)
}
