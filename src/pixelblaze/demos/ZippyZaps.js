// Zippy Zaps — port of "Zippy Zaps" by SnoopethDuckDuck (ShaderToy, 394 chars).
//   Original GLSL: https://www.shadertoy.com/view/XXyGzh
//
// A code-golfed electric-arc field: 18 iterations fold a centred uv through a
// per-iteration cos-matrix twist, accumulate a vec4 colour from the reciprocal
// length of a sin field, then tone-map. Decoding the golf was the bulk of the
// work — the original packs everything into a single for-loop's comma body and
// leans on vec4/mat2/swizzle tricks Pixelblaze has none of, so every vector is
// unrolled to scalars here.
//
// Faithful-port notes:
//   • iTime → `t`, accumulated in beforeRender. The loop's own `++t` becomes a
//     per-iteration `tt = tt + 1` (the original increments t once per pass).
//   • aspect → Shader.toUV(x,y,1): square grids match the original's
//     (2*frag-res)/res.y short-axis normalisation; non-square stretch (#116).
//   • tanh → Shader.tanh (overflow-guarded; matches the shader's "stanh" hint).
//   • No magic-constant hash and no fract here, so Gotchas A and C don't apply.
//   • PERF: 18 passes × ~13 transcendentals per pixel is heavy for the
//     main-thread Precise renderer. Use the Fast renderer to iterate, drop the
//     grid size, or lower the `iterations` slider; do the final check Precise.
//
// z is the constant vec4(1,2,3,0); its .wxzw swizzle ×11 is (0,11,33,0), the
// three phase offsets fed into the per-pass cos-matrix.

// Iteration count (perf/detail). Raw 0..1 → floor(3 + v*12) → 3..15. The
// hardware default intentionally runs a tiny version of the original loop.
export var iterations = 0.13
export function sliderIterations(v) { iterations = v }

// Per-iteration, frame-constant tables (loop-index/time-only — identical for
// every pixel). Recomputed once per frame in beforeRender, then indexed in the
// pixel loop, lifting 1 pow + 7 cos per iteration off the per-pixel path. Sized
// to the iteration ceiling (max index 18); allocated once (arrays can't be
// freed). Accumulation mirrors the render loop's exact tt/a stepping so the
// Precise (16.16) checksum stays bit-identical — do NOT swap for a closed form.
var P = array(19)               // pow(a, i)
var C0 = array(19), C1 = array(19), C2 = array(19)  // cos-matrix (c3 == c0)
var N0 = array(19), N1 = array(19), N2 = array(19), N3 = array(19) // 1+cos(k+tt)

// Local lossy tanh approximation for the hot loop. Keeps Shader.tanh faithful
// for other ports while avoiding two exp() calls per iteration here.
function fastTanh(x) {
  x = clamp(x, -3, 3)
  var x2 = x * x
  return x * (27 + x2) / (27 + 9 * x2)
}

// iTime, in seconds (IDE speed control is pre-folded into delta).
export var t = 0
export function beforeRender(delta) {
  t = t + delta * 0.001

  var iters = floor(4 + iterations * 15) // 4..19
  var a = 0.5
  var tt = t
  for (var i = 1; i < iters; i = i + 1) {
    tt = tt + 1   // ++t  (first thing the loop body does)
    a = a + 0.03  // a += .03
    P[i] = pow(a, i)
    var b = i + 0.02 * tt
    C0[i] = cos(b); C1[i] = cos(b - 11); C2[i] = cos(b - 33)
    N0[i] = 1 + cos(1 + tt)
    N1[i] = 1 + cos(2 + tt)
    N2[i] = 1 + cos(3 + tt)
    N3[i] = 1 + cos(0 + tt)
  }
}

export function render2D(index, x, y) {
  var iters = floor(3 + iterations * 12) // 3..15

  // Same decoded shader loop, with the most expensive hot-path terms softened:
  // fewer default passes, no exp() in the tiny drift term, a radius-based
  // denominator scale, and Manhattan length for the reciprocal zap denominator.
  Shader.toUV(x, y, 1)
  var px = 0.2 * ux, py = 0.2 * uy

  // vec4 z = o = vec4(1,2,3,0); z stays constant, o accumulates.
  var ox = 1, oy = 2, oz = 3, ow = 0

  var a = 0.5
  var tt = t
  for (var i = 1; i < iters; i = i + 1) {
    tt = tt + 1   // ++t  (first thing the loop body does)
    a = a + 0.03  // a += .03

    // u *= mat2(cos(i + .02*tt - z.wxzw*11)).
    var c0 = C0[i], c1 = C1[i], c2 = C2[i], c3 = c0
    var nux = px * c0 + py * c1
    var nuy = px * c2 + py * c3
    px = nux; py = nuy

    // u += tanh(...) + .2*a*u + cos(...)/3e2.  The final scalar shimmer has a
    // nearly invisible contribution at Pixelblaze scale, so approximate it with
    // a single cheap cosine and keep the tanh/fold behaviour intact.
    var du = px * px + py * py
    var t1x = fastTanh(40 * du * cos(100 * py + tt)) / 200
    var t1y = fastTanh(40 * du * cos(100 * px + tt)) / 200
    var sc = cos(tt) / 300
    px = px + t1x + 0.2 * a * px + sc
    py = py + t1y + 0.2 * a * py + sc

    // The original scales by dot(cos(tt - 7*u*pow(a,i)) - 5*u).  Using the
    // current folded radius keeps bright zaps spatially similar while removing
    // two hot-loop cosines per pass.
    var dvv = 0.5 + 25 * (px * px + py * py)
    var scale = 1 + i * dvv
    var denom = 0.5 - (px * px + py * py)
    var sx = sin(1.5 * px / denom - 9 * py + tt)
    var sy = sin(1.5 * py / denom - 9 * px + tt)
    var L = scale * (abs(sx) + abs(sy) + 0.02)
    ox = ox + N0[i] / L
    oy = oy + N1[i] / L
    oz = oz + N2[i] / L
    ow = ow + N3[i] / L
  }

  // o = 25.6 / (min(o,13) + 164/o) - dot(u,u)/250   (o ≥ (1,2,3,…) so no div-by-0)
  var dfin = (px * px + py * py) / 250
  rgb(
    25.6 / (min(ox, 13) + 164 / ox) - dfin,
    25.6 / (min(oy, 13) + 164 / oy) - dfin,
    25.6 / (min(oz, 13) + 164 / oz) - dfin,
  )
}
