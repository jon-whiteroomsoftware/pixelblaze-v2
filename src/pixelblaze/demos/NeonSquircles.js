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

export var t = 0

export function beforeRender(delta) {
  t = t + delta * 0.001
}

export function render2D(index, x, y) {
  // Centred uv via Shader.toUV (short axis = unit). aspect is hardcoded to 1:
  // a square grid matches the original's direct 2x-1; non-square grids stretch,
  // an accepted limitation (#96) as the preview exposes no cols/rows built-in.
  Shader.toUV(x, y, 1)
  var px = ux, py = uy          // Shader.toUV writes the ux/uy out-vars

  var mt = t % 2
  var finalR = 0, finalG = 0, finalB = 0

  for (var i = 0; i < 20; i = i + 1) {
    // Body: rotate with pre-increment i (0..19). The GLSL mat2(rot(i)) folds
    // by -angle, which Shader.rot2(.., -angle) reproduces → rx/ry out-vars.
    var angle = (t + i) * 0.03
    Shader.rot2(px, py, -angle)
    px = rx
    py = ry

    // Post: glow + color with post-increment index (1..20)
    var ic = i + 1

    // Squircle (L4) distance: sqrt(px^4 + py^4) == hypot(px², py²)
    var ux2 = px * px, uy2 = py * py
    var l4 = hypot(ux2, uy2)
    var gv = 0.004 / (abs(l4 - ic * 0.04) + 0.005)

    // Per-ring animation: stagger by ic*0.1 so the pulse sweeps across rings
    var anim = smoothstep(0.35, 0.4, abs(abs(mt - ic * 0.1) - 1))

    // Color: (cos(ic + [0,1,2]) + 1) — +1 keeps each channel non-negative
    finalR = finalR + gv * anim * (cos(ic) + 1)
    finalG = finalG + gv * anim * (cos(ic + 1) + 1)
    finalB = finalB + gv * anim * (cos(ic + 2) + 1)
  }

  rgb(finalR, finalG, finalB)
}
