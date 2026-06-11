// Crystal Lattice 3D — pulsing nodes connected by glowing lattice rods.
//
// Repeated coordinates and SDF-ish distances create a molecular/crystal volume
// without Perlin or raymarching. Good for cubes, spheres, and sparse 3D clouds.

export var speed = 0.42      // pulse speed
export var spacing = 0.32    // lattice density
export var nodeSize = 0.82   // node radius
export var hue = 0.52        // crystal colour

export function sliderSpeed(v) { speed = v }
export function sliderSpacing(v) { spacing = v }
export function sliderNodeSize(v) { nodeSize = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cells, nodeR

export function beforeRender(delta) {
  t = t + delta * 0.001 * (0.2 + speed * 1.5)
  cells = 3 + floor(spacing * 6)
  nodeR = 0.08 + nodeSize * 0.18
}

function repeatCell(v) {
  var u = v * cells
  return u - floor(u) - 0.5
}

export function render3D(index, x, y, z) {
  var px = repeatCell(x), py = repeatCell(y), pz = repeatCell(z)
  var node = clamp(1 - hypot3(px, py, pz) / nodeR, 0, 1)

  // Rods are distance to the nearest coordinate axis inside the repeated cell.
  var rodX = hypot(py, pz)
  var rodY = hypot(px, pz)
  var rodZ = hypot(px, py)
  var rod = clamp(1 - min(rodX, min(rodY, rodZ)) / (nodeR * 0.45), 0, 1)

  var cellPhase = floor(x * cells) + floor(y * cells) * 2 + floor(z * cells) * 3
  var pulse = 0.55 + 0.45 * wave(t * 0.35 + cellPhase * 0.071)
  var val = clamp(node * pulse + rod * 0.45, 0, 1)
  hsv(frac(hue + cellPhase * 0.017 + z * 0.12), 0.72, val)
}
