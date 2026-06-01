// Stock 3D cube SHELL: LEDs across the six faces of a cube (a hollow shell), as
// distinct from the filled `cube` volume lattice. The pixel count is the knob
// (ADR-0004), split as evenly as possible across the six faces; the first
// (count % 6) faces get one extra. Each face lays its share out on a square-ish
// in-plane sub-grid of cell CENTRES, so every point sits strictly inside its
// face, never on a shared edge. Emits raw [-1,1] coords (faces pinned at ±1);
// the shared normalize pass maps each axis to [0,1] (a symmetric cube, centre
// 0.5). The preview re-derives a per-face outward normal (dominant axis of
// pos − centre, ADR-0012) and offers the solidity slider.
function(pixelCount) {
  var n = Math.max(0, Math.floor(pixelCount) || 0)
  // Six faces as origin-pin axis + sign, with the two in-plane axes.
  var faces = [
    { axis: 0, sign: 1, u: 1, v: 2 },  // +x
    { axis: 0, sign: -1, u: 1, v: 2 }, // -x
    { axis: 1, sign: 1, u: 0, v: 2 },  // +y
    { axis: 1, sign: -1, u: 0, v: 2 }, // -y
    { axis: 2, sign: 1, u: 0, v: 1 },  // +z
    { axis: 2, sign: -1, u: 0, v: 1 }, // -z
  ]
  var base = Math.floor(n / 6)
  var extra = n % 6
  var coords = []
  for (var f = 0; f < 6; f++) {
    var k = base + (f < extra ? 1 : 0)
    if (k === 0) continue
    var cols = Math.ceil(Math.sqrt(k))
    var rows = Math.ceil(k / cols)
    var face = faces[f]
    for (var j = 0; j < k; j++) {
      // cell-centre fractions in (0,1) → in-plane coords in (-1,1)
      var u = 2 * ((j % cols) + 0.5) / cols - 1
      var v = 2 * (Math.floor(j / cols) + 0.5) / rows - 1
      var p = [0, 0, 0]
      p[face.axis] = face.sign
      p[face.u] = u
      p[face.v] = v
      coords.push(p)
    }
  }
  return coords
}
