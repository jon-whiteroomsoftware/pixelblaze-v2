// Example 2D ring: points evenly spaced around a circle. Irregular (non-grid)
// geometry. Emits raw cos/sin in [-1,1]; the shared normalize pass stretches
// each axis to fill [0,1].
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var coords = []
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 2 * Math.PI
    coords.push([Math.cos(a), Math.sin(a)])
  }
  return coords
}
