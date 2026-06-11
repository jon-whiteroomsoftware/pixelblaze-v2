// IQ Palettes — port of Inigo Quilez's "Palettes" reference card (ShaderToy,
// MIT). Original GLSL: the famous a + b*cos(2π(c·t + d)) cosine-palette trick.
//   Article: https://iquilezles.org/articles/palettes
//
// Seven horizontal bands, each a different (a,b,c,d) coefficient set, with the
// palette parameter scrolling left→right over time. A textbook-clean port: the
// shader is already exactly what Shader.iqPalette implements, so the only manual
// work is the per-band coefficient table and the band's border/shadow trim.
//
// Faithful-port notes:
//   • This shader uses RAW [0,1] uv (p = fragCoord/iResolution), NOT the centred
//     short-axis normalisation — so we use render2D's x,y directly and do NOT
//     route through Shader.toUV. (Gotcha B is about the centred idiom; n/a here.)
//   • iTime → `t` in beforeRender; the `0.01*iTime` scroll becomes a speed knob.
//   • fract(p.y*7) → Shader.fract (floor-based). p.y*7 is non-negative so frac
//     would agree here, but the guide says always use Shader.fract for ports.
//   • smoothstep(0.49, 0.47, …) has descending edges (e0 > e1), which Pixelblaze
//     smoothstep doesn't take — rewritten as 1 - smoothstep(0.47, 0.49, …).
//   • The IQ palette is pal(t,a,b,c,d) → Shader.iqPalette verbatim; no Gotcha A
//     magic-constant hash and no overflow-prone constants anywhere.

// Per-band IQ coefficients, flattened to band*3 + channel. a and b are the same
// 0.5/0.5 for bands 0–5; only band 6 differs. Pre-allocated at module scope (no
// per-pixel allocation — see the guide's perf budget).
var aTbl = [
  0.5, 0.5, 0.5,   // 0
  0.5, 0.5, 0.5,   // 1
  0.5, 0.5, 0.5,   // 2
  0.5, 0.5, 0.5,   // 3
  0.5, 0.5, 0.5,   // 4
  0.5, 0.5, 0.5,   // 5
  0.8, 0.5, 0.4,   // 6
]
var bTbl = [
  0.5, 0.5, 0.5,
  0.5, 0.5, 0.5,
  0.5, 0.5, 0.5,
  0.5, 0.5, 0.5,
  0.5, 0.5, 0.5,
  0.5, 0.5, 0.5,
  0.2, 0.4, 0.2,
]
var cTbl = [
  1.0, 1.0, 1.0,
  1.0, 1.0, 1.0,
  1.0, 1.0, 1.0,
  1.0, 1.0, 0.5,
  1.0, 0.7, 0.4,
  2.0, 1.0, 0.0,
  2.0, 1.0, 1.0,
]
var dTbl = [
  0.0, 0.33, 0.67,
  0.0, 0.10, 0.20,
  0.3, 0.20, 0.20,
  0.8, 0.90, 0.30,
  0.0, 0.15, 0.20,
  0.5, 0.20, 0.25,
  0.0, 0.25, 0.25,
]

// Scroll speed of the palette parameter. Default ≈ the original's 0.01*iTime.
export var speed = 0.49
export function sliderSpeed(v) { speed = v }

export var t = 0
var scroll = 0  // frame-constant palette-parameter offset (t * speed-scaled rate)
export function beforeRender(delta) {
  t = t + delta * 0.001
  scroll = t * (0.005 + speed * 0.1)
}

export function render2D(index, x, y) {
  // p.x scrolls; p.y selects the band. Raw [0,1] coords, no centring.
  var px = x + scroll
  var py = y

  // Band index 0..6 (floor(py*7), clamped — py==1 would land on 7).
  var band = floor(py * 7)
  if (band > 6) band = 6
  if (band < 0) band = 0
  var k = band * 3

  // col = pal(px, a, b, c, d) for this band's coefficients → cr, cg, cb.
  Shader.iqPalette(px,
                   aTbl[k], aTbl[k + 1], aTbl[k + 2],
                   bTbl[k], bTbl[k + 1], bTbl[k + 2],
                   cTbl[k], cTbl[k + 1], cTbl[k + 2],
                   dTbl[k], dTbl[k + 1], dTbl[k + 2])
  var r = cr, g = cg, b = cb

  // Band-local coordinate; trim borders and shade like a rounded swatch.
  var f = Shader.fract(py * 7)
  var border = 1 - smoothstep(0.47, 0.49, abs(f - 0.5))  // dark gaps between bands
  var shadow = 0.5 + 0.5 * sqrt(4 * f * (1 - f))         // vertical falloff
  var m = border * shadow

  rgb(r * m, g * m, b * m)
}
