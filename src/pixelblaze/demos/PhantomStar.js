// Phantom Star — port of the volumetric raymarched IFS fractal popularised by
// aiekick's "Phantom Mode" (ShaderToy MtScWW) and its many "octagrams" remixes.
//
// A ray is marched through a kaleidoscopically-folded space (polar mod ×5) whose
// per-cell object is a 5-iteration IFS box. Instead of a hard surface hit, each
// step accumulates an exponential glow (the "phantom" volumetric look), with a
// second accumulator pulsing rings of brightness outward over time.
//
// Faithful-port notes:
//   • Screen uv: the original's (2*frag - res)/min(res) is the centred square
//     normalisation → Shader.toUV(x, y, 1) (square; #116 stretch on non-square).
//   • mat2 rot(a) idiom → inlined cos/sin multiply-adds (the Shader.rot2 form).
//   • mod() is GLSL-floored and Pixelblaze's mod() matches — used directly for
//     the domain repeat and the ring pulse. (`%` would be wrong; it truncates.)
//   • atan(p.x, p.y) → atan2(p.x, p.y) (name + arg order, per the guide).
//   • length(v) → hypot3. No magic-constant hash, so Gotcha A doesn't apply.
//   • PERF (Gotcha E): this is a 90-ish-step raymarcher — heavy. The big win:
//     every rot() angle in the fold is iTime-only (NOT position-dependent), so
//     all that sin/cos is hoisted into beforeRender and computed ONCE per frame
//     rather than per-step per-pixel. Sliders trade steps/depth for speed; use
//     the Fast renderer to iterate and drop the grid size for the Precise check.

// ── Controls ──────────────────────────────────────────────────────────────────
export var speed   = 0.3  // animation rate
export var quality = 0.5  // march steps (detail vs. main-thread cost)
export var depth   = 0.6  // IFS fold iterations
export var gain    = 0.5  // overall glow brightness

export function sliderSpeed(v)   { speed = v }
export function sliderQuality(v) { quality = v }
export function sliderDepth(v)   { depth = v }
export function sliderGain(v)    { gain = v }

// ── Per-frame state ────────────────────────────────────────────────────────────
// t is iTime. The fold's three rotation angles (t*0.3, t*0.1, t) and the camera
// roll sin(t) are the SAME for every pixel, so their cos/sin live here, not in
// the hot loop.
export var t = 0
export var c03 = 1, s03 = 0   // rot(t*0.3) — the abs-fold xy twist
export var c01 = 1, s01 = 0   // rot(t*0.1) — the abs-fold xz twist
export var cf = 1,  sf = 0    // rot(t)     — final xz twist + camera roll sin

// Per-frame scalars derived only from sliders / time — same for every pixel, so
// computed once here rather than per pixel (iters/steps/g) or per step (ringT).
var fIters = 2, fSteps = 40, fGain = 1, ringT = 0

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.3 + speed * 1.8)
  c03 = cos(t * 0.3); s03 = sin(t * 0.3)
  c01 = cos(t * 0.1); s01 = sin(t * 0.1)
  cf = cos(t);        sf = sin(t)

  fIters = floor(2 + depth * 3)      // 2..5 IFS folds
  fSteps = floor(40 + quality * 55)  // 40..95 march steps
  fGain = 0.4 + gain * 1.2           // gain 0.5 ≈ the original's unscaled brightness
  ringT = 24 * t                     // ring-pulse phase: time-only, hoisted from the loop
}

// Folded box-IFS distance. Operates on px/py/pz module temporaries (set by the
// caller) to avoid per-call allocation; writes the distance to `ifsD`.
var ifsX = 0, ifsY = 0, ifsZ = 0, ifsD = 0
function ifsBox(iters) {
  var px = ifsX, py = ifsY, pz = ifsZ
  for (var i = 0; i < iters; i = i + 1) {
    px = abs(px) - 1; py = abs(py) - 1; pz = abs(pz) - 1
    // p.xy *= rot(t*0.3)
    var ax = px * c03 - py * s03
    py = px * s03 + py * c03; px = ax
    // p.xz *= rot(t*0.1)
    var bx = px * c01 - pz * s01
    pz = px * s01 + pz * c01; px = bx
  }
  // p.xz *= rot(t). NB: don't name this local `fx` — that shadows the
  // fixed-point runtime namespace and silently breaks the Precise renderer.
  var rxz = px * cf - pz * sf
  pz = px * sf + pz * cf; px = rxz

  // box(p, vec3(0.4, 0.8, 0.3))
  var dx = abs(px) - 0.4, dy = abs(py) - 0.8, dz = abs(pz) - 0.3
  var outside = hypot3(max(dx, 0), max(dy, 0), max(dz, 0))
  ifsD = min(max(dx, max(dy, dz)), 0) + outside
}

// Scene distance at world (wx, wy, wz). Writes via ifsBox → ifsD.
function map(wx, wy, wz, iters) {
  // Domain repeat (GLSL-floored mod, matched by Pixelblaze mod).
  var p1x = mod(wx - 5, 10) - 5
  var p1y = mod(wy - 5, 10) - 5
  var p1z = mod(wz, 16) - 8

  // pmod(p1.xy, 5): polar fold into 5 wedges.
  var a = atan2(p1x, p1y) + PI / 5
  var n = PI2 / 5
  a = floor(a / n) * n
  var ca = cos(a), sa = sin(a)
  // rotate (p1x, p1y) by -a
  ifsX = p1x * ca + p1y * sa
  ifsY = -p1x * sa + p1y * ca
  ifsZ = p1z
  ifsBox(iters)
}

export function render2D(index, x, y) {
  var iters = fIters
  var steps = fSteps

  // Centred square uv (short axis = unit; #116).
  Shader.toUV(x, y, 1)
  var sx = ux, sy = uy

  // Camera basis. cDir=(0,0,-1), cUp=(sin t,1,0), cSide=cross(cDir,cUp)=(1,-sin t,0).
  // ray = cSide*sx + cUp*sy + cDir, normalized.
  var rayX = sx + sf * sy
  var rayY = -sf * sx + sy
  var rayZ = -1
  Shader.normalize3(rayX, rayY, rayZ)
  rayX = nx; rayY = ny; rayZ = nz

  // cPos = (0, 0, -3*t)
  var camZ = -3 * t

  var acc = 0, acc2 = 0, tt = 0
  for (var i = 0; i < steps; i = i + 1) {
    var posX = rayX * tt
    var posY = rayY * tt
    var posZ = camZ + rayZ * tt
    map(posX, posY, posZ, iters)
    var dist = max(abs(ifsD), 0.02)
    var a = exp(-dist * 3)
    // Outward-pulsing rings: bright shell where length(pos)+24t wraps near 0.
    if (mod(hypot3(posX, posY, posZ) + ringT, 30) < 3) {
      a = a * 2
      acc2 = acc2 + a
    }
    acc = acc + a
    tt = tt + dist * 0.5
  }

  var g = fGain
  rgb(
    acc * 0.010 * g,
    (acc * 0.011 + acc2 * 0.002) * g,
    (acc * 0.012 + acc2 * 0.005) * g,
  )
}
