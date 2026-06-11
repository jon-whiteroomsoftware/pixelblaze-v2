// Neon Squircles — port of "Neon Squircles" by @kishimisu (2022)
//   Original GLSL (kishimisu, ShaderToy): https://www.shadertoy.com/view/mdjXRd
//
// The GLSL for-loop structure is: for(init; cond; post) body
//   body: u *= mat2(rot(i++))  — rotates with pre-increment i (0..19), then i becomes 1..20
//   post: O.rgb += glow*color*anim — samples squircle rings with the now-incremented i (1..20)
//
// Squircle shape: length(u*u) = sqrt(ux^4 + uy^4) is the L4-norm.
// Per-ring glow:  .004 / (abs(L4 - i*.04) + .005) — bright ring at each L4 iso-contour.
// Per-ring anim:  smoothstep stagger via i*.1 creates a wave sweeping across rings.

// ── Adjustable controls ────────────────────────────────────────────────────
export var speed = 0.69  // squircle spin and pulse rate

export function sliderSpeed(v) { speed = v }

export var t = 0

// Per-ring scratch tables (20 source rings). Everything that depends only on the
// loop index — or on the index AND time, but never on the pixel — is precomputed
// here instead of being recomputed for every pixel every frame (guide §6,
// "precompute loop-index-only work into a table"). The hardware default samples
// 5 representative rings from these 20, preserving the read while making the
// effect viable on-device.
//
//   colR/colG/colB — pure index constants (cos(ic + 0/1/2) + 1); filled once.
//   rc/rs          — rotation cos/sin of the per-ring angle (time-only); per frame.
//   animT          — the ring's smoothstep pulse weight (time-only); per frame.
var colR = array(20), colG = array(20), colB = array(20)
var rc = array(20), rs = array(20), animT = array(20)

// Index-only color constants — cos() here is the device's fixed-point cos, run
// once at load, so the values are bit-identical to computing cos(ic) per pixel.
for (var k = 0; k < 20; k = k + 1) {
  var ic0 = k + 1                 // post-increment index (1..20)
  colR[k] = cos(ic0) + 1
  colG[k] = cos(ic0 + 1) + 1
  colB[k] = cos(ic0 + 2) + 1
}

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.35 + speed * 2.4)
  var mt = t % 2
  for (var i = 0; i < 20; i = i + 1) {
    var ic = i + 1
    // Rotation angle is (t+i)*0.03, applied by Shader.rot2(.., -angle); precompute
    // cos/sin of that SAME negated argument so the per-pixel apply below is
    // bit-identical to the original rot2 call (no per-pixel sin/cos). Negate the
    // product (not the operand) to match the original's fixed-point rounding.
    var angle = (t + i) * 0.03
    var na = -angle
    rc[i] = cos(na)
    rs[i] = sin(na)
    // Per-ring pulse — time-only (mt) and index-only (ic), never per-pixel.
    animT[i] = smoothstep(0.35, 0.4, abs(abs(mt - ic * 0.1) - 1))
  }
}

export function render2D(index, x, y) {
  // Centred uv via Shader.toUV (short axis = unit). aspect is hardcoded to 1:
  // a square grid matches the original's direct 2x-1; non-square grids stretch,
  // an accepted limitation (#96) as the preview exposes no cols/rows built-in.
  Shader.toUV(x, y, 1)
  var px = ux, py = uy          // Shader.toUV writes the ux/uy out-vars

  var finalR = 0, finalG = 0, finalB = 0

  // Hardware retune: sample every fourth source ring and boost the contribution.
  // This was the measured step that moved the demo from single-digit FPS to a
  // usable frame rate while keeping the visual acceptable.
  for (var i = 0; i < 5; i = i + 1) {
    var ri = i * 4
    // Apply the selected source ring's precomputed rotation.
    var nx = px * rc[ri] - py * rs[ri]
    var ny = px * rs[ri] + py * rc[ri]
    px = nx
    py = ny

    var ic = ri + 1

    // Squircle (L4) distance: sqrt(px^4 + py^4) == hypot(px², py²)
    var ux2 = px * px, uy2 = py * py
    var l4 = hypot(ux2, uy2)
    var gv = 0.004 / (abs(l4 - ic * 0.04) + 0.005)

    // Same contribution shape as the original, scaled to compensate for the
    // reduced ring count.
    finalR = finalR + gv * animT[ri] * colR[ri] * 2.1
    finalG = finalG + gv * animT[ri] * colG[ri] * 2.1
    finalB = finalB + gv * animT[ri] * colB[ri] * 2.1
  }

  rgb(finalR, finalG, finalB)
}
