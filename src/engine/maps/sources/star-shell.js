// Stock 3D star SHELL: LEDs spread over the SURFACE of a stellated icosahedron
// (ADR-0012) — an icosahedron body with a pyramidal spike over each of its 20
// triangular faces, so the surface is 60 slanted triangles. Distinct from the
// retired wireframe star (lights on the edges) and the filled star-volume. The
// pixel count is the only knob (ADR-0004): points are dealt round-robin across
// the 60 faces, each placed strictly INSIDE its triangle via a Halton-folded
// barycentric coordinate (never on a shared edge). Emits raw coords; the shared
// normalize pass maps each axis to [0,1], aspect-preserving (the star is
// centrally symmetric, so it stays centred). The preview re-derives each point's
// face normal (starShellNormals) and offers the solidity slider.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var phi = (1 + Math.sqrt(5)) / 2

  var V = [
    [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
    [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
  ]
  for (var k = 0; k < V.length; k++) {
    var L = Math.sqrt(V[k][0] * V[k][0] + V[k][1] * V[k][1] + V[k][2] * V[k][2])
    V[k] = [V[k][0] / L, V[k][1] / L, V[k][2] / L]
  }
  function dist2(p, q) {
    var dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]
    return dx * dx + dy * dy + dz * dz
  }
  var minD2 = Infinity
  for (var a = 0; a < 12; a++)
    for (var b = a + 1; b < 12; b++) { var d = dist2(V[a], V[b]); if (d < minD2) minD2 = d }
  var adj = minD2 * 1.1
  var tip = 1.9

  // The 60 stellation triangles: each icosa face gets an apex; three slanted
  // triangles climb to it.
  var tris = []
  for (var a = 0; a < 12; a++)
    for (var b = a + 1; b < 12; b++)
      for (var c = b + 1; c < 12; c++)
        if (dist2(V[a], V[b]) <= adj && dist2(V[a], V[c]) <= adj && dist2(V[b], V[c]) <= adj) {
          var cx = (V[a][0] + V[b][0] + V[c][0]) / 3
          var cy = (V[a][1] + V[b][1] + V[c][1]) / 3
          var cz = (V[a][2] + V[b][2] + V[c][2]) / 3
          var cl = Math.sqrt(cx * cx + cy * cy + cz * cz)
          var apex = [(cx / cl) * tip, (cy / cl) * tip, (cz / cl) * tip]
          tris.push([V[a], V[b], apex], [V[b], V[c], apex], [V[c], V[a], apex])
        }

  // Radical inverse of `i` in `base` — a low-discrepancy fraction in [0,1).
  function halton(i, base) {
    var f = 1, r = 0
    while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base) }
    return r
  }

  var T = tris.length
  var coords = []
  for (var i = 0; i < n; i++) {
    var t = tris[i % T]
    var rank = Math.floor(i / T)
    // Halton (2,3) point in the unit square, nudged off the boundary, folded into
    // the triangle so it lands strictly inside.
    var s = halton(rank + 1, 2)
    var u = halton(rank + 1, 3)
    if (s + u > 1) { s = 1 - s; u = 1 - u }
    var w = 1 - s - u
    coords.push([
      t[0][0] * w + t[1][0] * s + t[2][0] * u,
      t[0][1] * w + t[1][1] * s + t[2][1] * u,
      t[0][2] * w + t[1][2] * s + t[2][2] * u,
    ])
  }
  return coords
}
