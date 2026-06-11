// Shader Showcase — a guided tour of the Shader porting library.
//
// One frame, most of the toolkit:
//   Shader.toUV     — centred, aspect-correct coordinates (short axis = unit)
//   Shader.rot2     — swirl space into a vortex (the mat2(rot) idiom)
//   Shader.fract    — floor-based space-fold for the kaleidoscope octaves
//   Shader.iqPalette— Inigo Quilez cosine gradient for the colour
//
// The vortex "breathes": the swirl amount eases back and forth between 0 and 1
// on its own clock (Anim.easeInOut2 over a triangle wave), so the field winds
// up, unwinds through a calm untwisted moment, and winds the other way.
//
// The out-var helpers write shared module-level globals (ux/uy, rx/ry,
// cr/cg/cb); read them immediately, before the next Shader call overwrites them.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0    // animation rate
export var zoom  = 0    // kaleidoscope density

export function sliderSpeed(v) { speed = v }
export function sliderZoom(v)  { zoom = v }

export var t = 0
export var breathe = 0   // 0..1, advances on its own steady clock
export var swirl = 0.5   // eased breathing value, driven from breathe
// Frame-constant derived values: half-time (swirl base phase), the twist
// coefficient, and the kaleidoscope zoom — lifted out of the per-pixel path.
var tHalf, twistC, zoomM

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.3 + speed * 2)
  // Independent, slower clock for the swirl breath.
  breathe = breathe + delta * 0.001 * 0.18
  // triangle() ping-pongs 0→1→0; easeInOut2 softens the turnarounds so the
  // vortex lingers at full twist and at the calm centre.
  swirl = Anim.easeInOut2(triangle(breathe))
  tHalf = t * 0.5
  twistC = swirl * 6 - 3   // twist coefficient sweeps -3..3 through 0 (untwisted)
  zoomM = 1.5 + zoom * 3
}

export function render2D(index, x, y) {
  // Centred uv, short axis = unit (square aspect here).
  Shader.toUV(x, y, 1)
  var px = ux, py = uy
  var rad = hypot(px, py)

  // Swirl: rotate more the further out you go, so space winds into a vortex.
  Shader.rot2(px, py, tHalf + rad * twistC)
  px = rx
  py = ry

  var accR = 0, accG = 0, accB = 0

  // Two-octave kaleidoscope fold tinted by the IQ palette (à la Kishimisu).
  for (var i = 0; i < 2; i = i + 1) {
    var qx = Shader.fract(px * zoomM) - 0.5
    var qy = Shader.fract(py * zoomM) - 0.5
    var d = hypot(qx, qy)

    // a + b·cos(2π(c·t + d)) per channel → cr/cg/cb. Phased per octave + time.
    Shader.iqPalette(rad + i * 0.3 + t * 0.2,
                     0.5, 0.5, 0.5,
                     0.5, 0.5, 0.5,
                     1, 1, 1,
                     0.0, 0.33, 0.67)

    d = abs(sin(d * 8 + t)) * 0.5 + 0.025
    var gd = 0.05 / d
    var glow = gd * (0.7 + 0.3 * gd)
    accR = accR + cr * glow
    accG = accG + cg * glow
    accB = accB + cb * glow
  }

  // Lift the whole frame so the voids glow rather than go black.
  accR = accR * 1.5 + 0.06
  accG = accG * 1.5 + 0.06
  accB = accB * 1.5 + 0.06

  rgb(accR, accG, accB)
}
