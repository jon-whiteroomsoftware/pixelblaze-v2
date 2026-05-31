// Example 3D sphere shell via the Fibonacci lattice: evenly distributed points
// over a sphere with a genuinely irregular index order. Emits raw [-1,1] coords;
// the shared normalize pass maps each axis to [0,1].
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var golden = Math.PI * (3 - Math.sqrt(5))
  var coords = []
  for (var i = 0; i < n; i++) {
    var y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0
    var r = Math.sqrt(Math.max(0, 1 - y * y))
    var a = golden * i
    coords.push([Math.cos(a) * r, y, Math.sin(a) * r])
  }
  return coords
}
