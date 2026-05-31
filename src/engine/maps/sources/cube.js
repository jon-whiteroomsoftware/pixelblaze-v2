// Stock 3D cube lattice. The pixel count is the knob (ADR-0004), cubed up to a
// side x side x side lattice: side = round(cbrt(n)). Emits raw integer lattice
// indices, x-fastest then y then z; the shared normalize pass turns each axis
// index into [0,1]. A degenerate single-cell axis collapses to 0.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var side = Math.max(1, Math.round(Math.cbrt(n)))
  var coords = []
  for (var i = 0; i < pixelCount; i++) {
    var x = i % side
    var y = Math.floor(i / side) % side
    var z = Math.floor(i / (side * side))
    coords.push([x, y, z])
  }
  return coords
}
