// Stock 3D tetrahedron VOLUME: LEDs filling the INTERIOR of a regular
// tetrahedron (a four-sided die / d4), distinct from the surface-only
// tetra-shell. The solid is convex, so a ray from the centre exits exactly once:
// along each Fibonacci-lattice direction we find that exit radius R (the nearest
// positive crossing of the four face planes) and place the point at r = R·cbrt(u)
// for a van der Corput u, so points are evenly distributed by VOLUME out to the
// real boundary instead of clustering at the centre. The pixel count is the only
// knob (ADR-0004). Emits raw coords; the shared normalize pass maps each axis to
// [0,1]. A volume carries no per-point boundary normal, so it is not
// solid-eligible.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var s = 1 / Math.sqrt(3)
  var V = [
    [ s,  s,  s],
    [ s, -s, -s],
    [-s,  s, -s],
    [-s, -s,  s],
  ]
  // The four faces as outward unit normal + plane offset (a face opposite vertex
  // i faces along -V[i]; any other vertex lies on it).
  var faces = []
  for (var i = 0; i < 4; i++) {
    var nx = -V[i][0], ny = -V[i][1], nz = -V[i][2]
    var a = V[(i + 1) % 4]
    faces.push({ nx: nx, ny: ny, nz: nz, off: a[0] * nx + a[1] * ny + a[2] * nz })
  }
  var golden = Math.PI * (3 - Math.sqrt(5))
  var coords = []
  for (var k = 0; k < n; k++) {
    var y = n > 1 ? 1 - ((k + 0.5) / n) * 2 : 0
    var ringR = Math.sqrt(Math.max(0, 1 - y * y))
    var ang = golden * k
    var dir = [Math.cos(ang) * ringR, y, Math.sin(ang) * ringR]
    // Exit radius along dir: the nearest positive face-plane crossing (convex).
    var R = Infinity
    for (var fi = 0; fi < 4; fi++) {
      var d = dir[0] * faces[fi].nx + dir[1] * faces[fi].ny + dir[2] * faces[fi].nz
      if (d > 1e-12) {
        var t = faces[fi].off / d
        if (t < R) R = t
      }
    }
    if (!(R > 0) || R === Infinity) R = 1
    // van der Corput base-2 fraction, decorrelated from the angular index, then
    // cbrt for an even-by-volume radius out to the boundary R.
    var u = 0, den = 0.5, kk = k + 1
    while (kk > 0) { u += (kk % 2) * den; den *= 0.5; kk = Math.floor(kk / 2) }
    var r = R * Math.cbrt(u)
    coords.push([dir[0] * r, dir[1] * r, dir[2] * r])
  }
  return coords
}
