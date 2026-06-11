// Crystal Lattice 3D — pulsing nodes connected by glowing lattice rods.
//
// Repeated coordinates and SDF-ish distances create a molecular/crystal volume
// without Perlin or raymarching. Good for cubes, spheres, and sparse 3D clouds.

export var speed = 0.26      // pulse speed
export var spacing = 0.79    // lattice density
export var nodeSize = 0.92   // node radius
export var hue = 0.70        // crystal colour bias

export function sliderSpeed(v) { speed = v }
export function sliderSpacing(v) { spacing = v }
export function sliderNodeSize(v) { nodeSize = v }
export function sliderHue(v) { hue = v }

export var t = 0
var cells, nodeR, paletteT, paletteIndex, paletteDrift

paletteT = 0

export function beforeRender(delta) {
  var dt = delta * 0.001
  t = t + dt * (0.2 + speed * 1.5)
  paletteT = paletteT + dt
  cells = 3 + floor(spacing * 6)
  nodeR = 0.10 + nodeSize * 0.21

  // Hold each hand-picked palette for about ten seconds. The slow drift keeps the
  // crystal alive without sweeping through the whole colour wheel.
  var paletteStep = floor(paletteT * 0.1)
  paletteIndex = paletteStep - floor(paletteStep / 3) * 3
  paletteDrift = wave(paletteT * 0.09)
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
  var rod = clamp(1 - min(rodX, min(rodY, rodZ)) / (nodeR * 0.62), 0, 1)

  var cellPhase = floor(x * cells) + floor(y * cells) * 2 + floor(z * cells) * 3
  var pulse = 0.55 + 0.45 * wave(t * 0.35 + cellPhase * 0.071)
  var val = clamp(node * pulse * 1.08 + rod * 0.72 + 0.018, 0, 1)

  var shimmer = wave(paletteT * 0.14 + cellPhase * 0.043 + z * 0.27)
  var accent = wave(paletteT * 0.07 + x * 0.19 + y * 0.13)
  var palHue = hue + 0.02 * (paletteDrift - 0.5) + cellPhase * 0.006 + z * 0.035
  var sat = 0.68

  // Three narrow, non-rainbow moods: glacial cyan/violet, mineral teal/gold, and
  // dusk amethyst/rose. Each cycles internally, then snaps to the next family.
  if (paletteIndex < 1) {
    palHue = palHue + 0.49 + shimmer * 0.055 + accent * 0.025
    sat = 0.54 + shimmer * 0.20
  } else if (paletteIndex < 2) {
    palHue = palHue + 0.36 + shimmer * 0.040
    if (accent > 0.63) palHue = palHue + 0.105
    sat = 0.62 + shimmer * 0.22
  } else {
    palHue = palHue + 0.71 + shimmer * 0.060
    if (accent > 0.58) palHue = palHue + 0.055
    sat = 0.58 + shimmer * 0.25
  }

  hsv(frac(palHue), clamp(sat, 0, 1), val)
}
