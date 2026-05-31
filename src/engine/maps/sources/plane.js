// Stock 2D plane / grid. The pixel count is the only knob (ADR-0004) and the
// plane has no aspect to honour, so it squares the count up to the most-square
// grid that holds it: cols = ceil(sqrt(n)), rows = ceil(n/cols). Emits raw
// row/col integer indices in row-major order (x-fastest); the shared normalize
// pass turns col -> col/(cols-1), reproducing the legacy grid byte-for-byte.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var cols = Math.ceil(Math.sqrt(n))
  var coords = []
  for (var i = 0; i < pixelCount; i++) {
    coords.push([i % cols, Math.floor(i / cols)])
  }
  return coords
}
