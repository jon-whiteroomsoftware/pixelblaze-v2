// 2D panel winding maps pixel index order onto a rectangular LED panel whose
// wiring snakes through the panel instead of restarting from the same side on
// every row or column. This source defaults to vertical strips: pixel 0 starts
// at the top of the first column, the next column reverses direction, and so on.
function(pixelCount) {
  var n = Math.max(1, Math.floor(pixelCount) || 1)
  var W = Math.ceil(Math.sqrt(n))
  var H = Math.ceil(n / W)

  // --- winding knobs (flip these if orientation is off) ---
  var SNAKE_BY_COLUMN = true  // data snakes in vertical strips
  var SERPENTINE      = true  // every other strip reverses
  var FLIP_X          = false // mirror left/right
  var FLIP_Y          = false // mirror top/bottom

  var coords = []
  for (var i = 0; i < n; i++) {
    var strip, pos, x, y

    if (SNAKE_BY_COLUMN) {
      strip = Math.floor(i / H)   // which column
      pos   = i % H               // position down that column
      if (SERPENTINE && (strip % 2 == 1)) pos = H - 1 - pos
      x = strip
      y = pos
    } else {
      strip = Math.floor(i / W)   // which row
      pos   = i % W               // position along that row
      if (SERPENTINE && (strip % 2 == 1)) pos = W - 1 - pos
      x = pos
      y = strip
    }

    if (FLIP_X) x = W - 1 - x
    if (FLIP_Y) y = H - 1 - y

    coords.push([x, y])
  }
  return coords
}
