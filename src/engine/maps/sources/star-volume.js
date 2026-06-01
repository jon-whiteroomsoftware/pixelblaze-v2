// Stock 3D star VOLUME: LEDs filling the INTERIOR of the stellated icosahedron
// (ADR-0012), distinct from the surface-only star-shell. The solid is star-
// shaped about its centre, so a ray from the origin exits the surface exactly
// once: along each Fibonacci-lattice direction we find that exit radius R (the
// one stellation triangle the ray passes through, Möller–Trumbore) and place the
// point at r = R·cbrt(u) for a van der Corput u, so points are evenly distributed
// by VOLUME out to the real spiky boundary instead of clustering at the centre.
// The pixel count is the only knob (ADR-0004). Emits raw coords; the shared
// normalize pass maps each axis to [0,1]. A volume carries no per-point boundary
// normal, so it is not solid-eligible.
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

  // The 60 stellation triangles, used for ray-triangle exit tests.
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

  // Möller–Trumbore: distance along ray `dir` from the origin to triangle t, or
  // -1 on a miss.
  function rayTri(dir, t) {
    var p0 = t[0], p1 = t[1], p2 = t[2]
    var e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    var e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
    var px = dir[1] * e2[2] - dir[2] * e2[1]
    var py = dir[2] * e2[0] - dir[0] * e2[2]
    var pz = dir[0] * e2[1] - dir[1] * e2[0]
    var det = e1[0] * px + e1[1] * py + e1[2] * pz
    if (Math.abs(det) < 1e-12) return -1
    var inv = 1 / det
    var tv = [-p0[0], -p0[1], -p0[2]]
    var su = (tv[0] * px + tv[1] * py + tv[2] * pz) * inv
    if (su < 0 || su > 1) return -1
    var qx = tv[1] * e1[2] - tv[2] * e1[1]
    var qy = tv[2] * e1[0] - tv[0] * e1[2]
    var qz = tv[0] * e1[1] - tv[1] * e1[0]
    var sv = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv
    if (sv < 0 || su + sv > 1) return -1
    var tt = (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv
    return tt > 1e-9 ? tt : -1
  }

  var golden = Math.PI * (3 - Math.sqrt(5))
  var coords = []
  for (var i = 0; i < n; i++) {
    var y = n > 1 ? 1 - ((i + 0.5) / n) * 2 : 0
    var ringR = Math.sqrt(Math.max(0, 1 - y * y))
    var ang = golden * i
    var dir = [Math.cos(ang) * ringR, y, Math.sin(ang) * ringR]
    // Exit radius of this ray: the one triangle it passes through.
    var R = -1
    for (var ti = 0; ti < tris.length; ti++) {
      var hit = rayTri(dir, tris[ti])
      if (hit > 0) { R = hit; break }
    }
    if (R <= 0) R = 1
    // van der Corput base-2 fraction, decorrelated from the angular index, then
    // cbrt for an even-by-volume radius out to the boundary R.
    var u = 0, denD = 0.5, kk = i + 1
    while (kk > 0) { u += (kk % 2) * denD; denD *= 0.5; kk = Math.floor(kk / 2) }
    var r = R * Math.cbrt(u)
    coords.push([dir[0] * r, dir[1] * r, dir[2] * r])
  }
  return coords
}
