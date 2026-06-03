// Stock 3D tetrahedron SHELL: LEDs across the four triangular faces of a regular
// tetrahedron (a four-sided die / d4), a hollow shell — distinct from the filled
// `tetra-volume`. The pixel count is the knob (ADR-0004), split as evenly as
// possible across the four faces; the first (count % 4) faces get one extra. Each
// face subdivides into a triangular sub-grid and emits the CENTROIDS of the small
// triangles, so every point sits strictly inside its face, never on a shared
// edge. Emits raw [-s,s] coords; the shared normalize pass maps each axis to
// [0,1]. The preview re-derives a per-face outward normal (tetraShellNormals,
// ADR-0012) and offers the solidity slider.
function(pixelCount) {
  var n = Math.max(0, Math.floor(pixelCount) || 0)
  var s = 1 / Math.sqrt(3)
  // Four vertices: alternating cube corners (the regular-tetrahedron embedding).
  var V = [
    [ s,  s,  s],
    [ s, -s, -s],
    [-s,  s, -s],
    [-s, -s,  s],
  ]
  // Each face is the triangle of the three vertices OPPOSITE one vertex.
  var faces = [
    [V[1], V[2], V[3]],
    [V[0], V[2], V[3]],
    [V[0], V[1], V[3]],
    [V[0], V[1], V[2]],
  ]
  var base = Math.floor(n / 4)
  var extra = n % 4
  var coords = []
  for (var f = 0; f < 4; f++) {
    var k = base + (f < extra ? 1 : 0)
    if (k === 0) continue
    var A = faces[f][0], B = faces[f][1], C = faces[f][2]
    // Subdivide the triangle into rows^2 small triangles; rows^2 >= k.
    var rows = Math.ceil(Math.sqrt(k))
    // Barycentric centroids of the small triangles, upward then downward.
    var cells = []
    for (var i = 0; i <= rows - 1; i++)
      for (var j = 0; i + j <= rows - 1; j++)
        cells.push([
          (3 * (rows - i - j) - 2) / (3 * rows),
          (3 * i + 1) / (3 * rows),
          (3 * j + 1) / (3 * rows),
        ])
    for (var i2 = 0; i2 <= rows - 2; i2++)
      for (var j2 = 0; i2 + j2 <= rows - 2; j2++)
        cells.push([
          (3 * (rows - i2 - j2) - 4) / (3 * rows),
          (3 * i2 + 2) / (3 * rows),
          (3 * j2 + 2) / (3 * rows),
        ])
    for (var c = 0; c < k; c++) {
      var w = cells[c]
      coords.push([
        w[0] * A[0] + w[1] * B[0] + w[2] * C[0],
        w[0] * A[1] + w[1] * B[1] + w[2] * C[1],
        w[0] * A[2] + w[1] * B[2] + w[2] * C[2],
      ])
    }
  }
  return coords
}
