// Firefly Choir (1D) — emergent synchronization, not a programmed blink.
//
// Every LED is a firefly: a phase oscillator with its own slightly-different
// natural rhythm that flashes when its phase comes round. Each frame, each one
// nudges its phase toward its two neighbours' (local Kuramoto coupling) — exactly
// the math behind synchronizing fireflies and pacemaker cells. Started at random
// they twinkle in chaos; then, with no conductor, order spreads: ripples of
// agreement merge until the strip pulses in waves, and the small spread of natural
// rhythms keeps it forever re-forming rather than freezing.
//
// Turn COUPLING up to pull from shimmering chaos toward a glassy collective pulse.
//
// State lives in per-pixel arrays, lazily (re)built whenever pixelCount changes.

export var coherence   // exported so the Var Watcher shows order rising out of noise

var phase             // each firefly's current phase, 0..1
var spreadSeed        // each firefly's natural-rhythm deviation, -0.5..0.5
var colorSeed         // each firefly's colour-margin deviation, -0.5..0.5
var nextPhase         // double-buffer so neighbours are read, not half-updated
var built = 0         // pixelCount the arrays were built for (0 = not yet)

// Tunables (live, via the sliders below).
var coupling = 1.0    // how hard neighbours pull together (0 = independent)
var baseFreq = 0.7    // base flashes per second
var spread   = 0.25   // variance in natural rhythm (keeps it alive)
var baseHue  = 0.22   // firefly green-yellow (dim end of the flash)
var colorShift = 0.12 // hue the bright end coordinates toward (relative to baseHue)
var variance = 0.3    // per-firefly jitter of the colour margins (0 = all identical)

export function sliderCoupling(v) { coupling = v * 2.5 }
export function sliderTempo(v)    { baseFreq = 0.25 + v * 1.6 }
export function sliderSpread(v)   { spread = v * 0.5 }
export function sliderColor(v)    { baseHue = v }
export function sliderVariance(v) { variance = v }

function buildFireflies() {
  phase = array(pixelCount)
  spreadSeed = array(pixelCount)
  colorSeed = array(pixelCount)
  nextPhase = array(pixelCount)
  var i = 0
  for (i = 0; i < pixelCount; i++) {
    phase[i] = random(1)
    spreadSeed[i] = random(1) - 0.5
    colorSeed[i] = random(1) - 0.5
  }
  built = pixelCount
}

export function beforeRender(delta) {
  if (built != pixelCount) buildFireflies()
  var n = pixelCount
  var dt = delta * 0.001

  // Order parameter: mean of cos(2*pi*phase). |order| ~0 when scattered, ~1 in unison.
  var sumc = 0

  var i = 0
  for (i = 0; i < n; i++) {
    var il = (i == 0) ? n - 1 : i - 1       // ring neighbours
    var ir = (i == n - 1) ? 0 : i + 1
    var pull = sin((phase[il] - phase[i]) * PI2) + sin((phase[ir] - phase[i]) * PI2)
    var freq = baseFreq * (1 + spreadSeed[i] * spread * 2)
    nextPhase[i] = mod(phase[i] + (freq + coupling * pull) * dt, 1)
    sumc += cos(phase[i] * PI2)
  }

  for (i = 0; i < n; i++) phase[i] = nextPhase[i]
  coherence = abs(sumc / n)
}

export function render(index) {
  var p = phase[index]
  var v = wave(p)
  v = v * v * v * v          // sharpen into a crisp blink (^4)
  v = v * v                   // ^8

  // Intensity drives colour: base hue while dim, blending to the coordinating hue
  // across the bright top ~20%, then desaturating to a white-hot tip at the peak.
  // (Overlapping synced fireflies still pile up to broad white via additive blend.)
  //
  // VARIANCE perturbs each firefly's hue and the three transition margins by a
  // per-firefly random amount, so the population isn't identical. At 0 it collapses
  // back to the exact precise mapping. cs2 is a decorrelated second random so the
  // hue jitter and the threshold jitter don't move together.
  var cs = colorSeed[index]
  var cs2 = mod(cs * 7.31 + 0.137, 1) - 0.5
  var hueJit = cs * variance * 0.08
  var t0 = 0.5 + cs2 * variance * 0.18    // blend-start margin
  var t1 = 0.92 + cs * variance * 0.05    // blend-end margin
  var w0 = 0.92 + cs2 * variance * 0.05   // white-tip margin

  var hue = baseHue + hueJit + colorShift * smoothstep(t0, t1, v)
  var sat = 0.85 - 0.85 * smoothstep(w0, 1, v)
  hsv(hue, sat, clamp(v * 1.25 + 0.025, 0, 1))
}
