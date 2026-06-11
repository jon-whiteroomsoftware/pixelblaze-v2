// Kaleido Bloom — a static SDF lattice set in motion entirely by the
// coordinate transform stack.
//
// The render function draws a fixed field of dots and rings on a repeating
// grid. All of the motion — the spin and the breathing zoom — comes from
// rotate()/scale()/translate() composed in beforeRender. The colour is a
// rotating rainbow that radiates from the centre, so the bloom shifts hue as
// it turns rather than sitting on one tone.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 1         // spin + breathe rate
export var zoom = 0.85       // lattice cell size
export var breatheAmt = 0.5  // how much the zoom pulses
export var colorSpread = 0.5 // width of the radial rainbow

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v) { zoom = v }
export function sliderBreathe(v) { breatheAmt = v }
export function sliderColorSpread(v) { colorSpread = v }

export var t
var hueShift = 0
// Lattice geometry and rainbow width are frame-constant (slider-derived) —
// computed once per frame, not per pixel.
var CELL, cellHalf, dotR, ringW, spread

export function beforeRender(delta) {
  CELL = 0.15 + zoom * 0.25
  cellHalf = CELL * 0.5
  dotR = CELL * 0.30
  ringW = CELL * 0.07
  spread = 0.5 + colorSpread * 3.5
  var period = 0.3 - speed * 0.22  // smaller period = faster
  t = time(period)
  // Palette cycles on its own steady clock, independent of the spin, so a
  // given petal sweeps through the whole spectrum rather than holding one hue.
  hueShift = time(0.08)

  var spin = t * PI2               // one clean revolution per period
  var amt = 0.2 + breatheAmt * 0.9
  var breathe = 1.4 + amt * wave(t * 2)

  // Spin and breathe about the grid centre (0.5, 0.5).
  resetTransform()
  translate(-0.5, -0.5)
  rotate(spin)
  scale(breathe, breathe)
  translate(0.5, 0.5)
}

export function render2D(index, x, y) {
  // x, y arrive already spun and zoomed by the transform stack.
  // Lattice A — solid dots
  var gx = mod(x, CELL) - cellHalf
  var gy = mod(y, CELL) - cellHalf
  var dot = SDF.circle(gx, gy, 0, 0, dotR)

  // Lattice B — half-offset rings, interleaved with the dots
  var hx = mod(x + cellHalf, CELL) - cellHalf
  var hy = mod(y + cellHalf, CELL) - cellHalf
  var rng = SDF.ring(hx, hy, 0, 0, dotR, ringW)

  var field = SDF.smoothUnion(dot, rng, 0.05)
  var lit = SDF.fillGlow(field, 0.045)

  // Rainbow radiates from the centre and rotates over time.
  var dx = x - 0.5, dy = y - 0.5
  var rad = sqrt(dx * dx + dy * dy)
  var hue = frac(hueShift + rad * spread + (x + y) * 0.12)
  hsv(hue, 0.9, lit * lit)
}
