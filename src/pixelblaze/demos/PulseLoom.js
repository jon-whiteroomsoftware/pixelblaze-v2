// Pulse Loom (1D) — a polyrhythm engine, not a chase.
//
// Four percussion "voices" sit at fixed homes along the strip. Each strikes a
// sharp attack/soft-decay bloom on its own tempo, and the tempos are small whole
// multiples of one bar (2, 3, 4, 5 hits per bar). Because the counts are coprime
// the hits interlock and syncopate against each other all bar long — then, once
// per bar, every voice lands on the downbeat at once and the whole strip flashes.
// So it reads as rhythm in place: an interlocking groove that periodically snaps
// into a unified accent and unwinds again.
//
// Key trick: with integer hits-per-bar, frac(beat * k) depends only on frac(beat),
// so we can keep a single bounded bar phase in [0,1) — no unbounded accumulator to
// overflow 16.16 (the voices realign exactly when the bar wraps).

export var barPhase = 0

// Voices: hits per bar and home position (0..1). Colour comes from a rotatable
// complementary palette (see below): the left pair are the primary hue + a darker
// shade of it, the right pair the complement + a darker shade — so overlapping
// strikes stay legible and the whole strip reads as one coherent four-colour set.
var hitsPerBar = [2, 3, 4, 5]
var homePos    = [0.16, 0.40, 0.62, 0.86]
var hueOffset  = [0, 0, 0.5, 0.5]       // primary, primary, complement, complement
var voiceShade = [1, 0.45, 1, 0.45]     // full, darker, full, darker
var env        = [0, 0, 0, 0]           // per-voice strike envelope, filled each frame

// Tunables (live, via the sliders below).
var bps        = 1.6   // bars per second (the tempo)
var swing      = 0.0   // 0 = straight, up to ~0.4 = heavy lilt
var bumpWidth  = 0.07  // half-width of each strike's glow, as a fraction of strip
var paletteHue = 0.04  // base hue of the complementary set; slider spins it round
var accentOn   = 1     // downbeat full-strip flash
var accentEnv  = 0     // this frame's accent brightness

export function sliderTempo(v)   { bps = 0.2 + v * 3.15 }
export function sliderSwing(v)   { swing = v * 0.4 }
export function sliderWidth(v)   { bumpWidth = 0.005 + v * 0.11 }
export function sliderPalette(v) { paletteHue = v }
export function toggleAccent(v)  { accentOn = v }

// Warp a 0..1 cycle phase so its midpoint lands late — a swing/groove lilt.
function applySwing(p, s) {
  var pivot = 0.5 + s
  if (p < pivot) return (p / pivot) * 0.5
  return 0.5 + (p - pivot) / (1 - pivot) * 0.5
}

export function beforeRender(delta) {
  barPhase = mod(barPhase + delta * 0.001 * bps, 1)

  var i = 0
  for (i = 0; i < 4; i++) {
    var vp = mod(barPhase * hitsPerBar[i], 1)   // this voice's own strike phase
    vp = applySwing(vp, swing)
    env[i] = exp(-vp * 6)                        // instant attack, quick decay
  }

  // Grand downbeat: one bright flash as the bar wraps through 0.
  accentEnv = accentOn ? exp(-barPhase * 9) * 0.7 : 0
}

export function render(index) {
  var pos = index / (pixelCount - 1)

  var total = 0
  var domHue = 0
  var domWeight = 0
  var i = 0
  for (i = 0; i < 4; i++) {
    var d = pos - homePos[i]
    var bump = exp(-(d * d) / (2 * bumpWidth * bumpWidth))
    var c = env[i] * bump * voiceShade[i]   // darker-shade voices contribute less light
    total += c
    if (c > domWeight) { domWeight = c; domHue = mod(paletteHue + hueOffset[i], 1) }   // strongest voice owns the hue
  }

  var val = clamp(total + accentEnv, 0, 1)
  var sat = 1 - accentEnv      // the accent whitens as it brightens
  hsv(domHue, sat, val)
}
