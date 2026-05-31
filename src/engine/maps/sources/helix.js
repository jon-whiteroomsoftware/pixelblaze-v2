// Example 3D helix point cloud: a spiral of 5 turns climbing the y axis.
// Irregular (not a lattice). Emits raw cos/sin in [-1,1] for the circular cross
// section and the raw index for height; the shared normalize pass maps each axis
// to [0,1].
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var turns = 5
  var coords = []
  for (var i = 0; i < n; i++) {
    var t = n > 1 ? i / (n - 1) : 0
    var a = t * turns * 2 * Math.PI
    coords.push([Math.cos(a), i, Math.sin(a)])
  }
  return coords
}
