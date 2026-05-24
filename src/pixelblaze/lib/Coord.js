// Coord — coordinate systems, transforms, and spatial utilities
//
// All functions are pure scalar — no arrays, no objects.
// Assumes: sin, cos, atan2, sqrt, abs, floor, round, PI, clamp

// ─── Polar ───────────────────────────────────────────────────────────────────

// Angle from grid centre (0.5, 0.5), returned as 0..1
function polarAngle(x, y) {
  return (atan2(y - 0.5, x - 0.5) / (PI * 2) + 1) % 1;
}

// Angle from arbitrary centre, returned as 0..1
function angleFrom(x, y, cx, cy) {
  return (atan2(y - cy, x - cx) / (PI * 2) + 1) % 1;
}

// Radius from grid centre, normalised so the unit-circle edge ≈ 1
function polarRadius(x, y) {
  var dx = x - 0.5, dy = y - 0.5;
  return sqrt(dx * dx + dy * dy) * 2;
}

// Radius from arbitrary centre, unnormalised
function radiusFrom(x, y, cx, cy) {
  var dx = x - cx, dy = y - cy;
  return sqrt(dx * dx + dy * dy);
}

// ─── Rotation ────────────────────────────────────────────────────────────────

// Rotated x coordinate around (cx, cy) by angle a (radians)
function rotateX(x, y, cx, cy, a) {
  var dx = x - cx, dy = y - cy;
  return cx + dx * cos(a) - dy * sin(a);
}

// Rotated y coordinate around (cx, cy) by angle a (radians)
function rotateY(x, y, cx, cy, a) {
  var dx = x - cx, dy = y - cy;
  return cy + dx * sin(a) + dy * cos(a);
}

// ─── Scale ───────────────────────────────────────────────────────────────────

// Scale x around centre cx by factor s
function scaleX(x, cx, s) { return cx + (x - cx) * s; }
// Scale y around centre cy by factor s
function scaleY(y, cy, s) { return cy + (y - cy) * s; }

// ─── Mirror / fold ───────────────────────────────────────────────────────────

// Fold x at 0.5; left half mirrors right
function mirrorX(x) { return x < 0.5 ? x : 1 - x; }
// Fold y at 0.5; top half mirrors bottom
function mirrorY(y) { return y < 0.5 ? y : 1 - y; }
// Fold v at an arbitrary axis point
function mirrorAround(v, axis) { return v < axis ? v : 2 * axis - v; }

// ─── Tiling ──────────────────────────────────────────────────────────────────

// Position within one cell of n equal tiles
function tile(v, n) { return (v * n) % 1; }

// Which tile cell (0-indexed)
function tileCell(v, n) { return floor(v * n); }

// Tile with every other cell mirrored for seamless tiling
function tileMirror(v, n) {
  var t = (v * n) % 1;
  var c = floor(v * n);
  return (c % 2 === 0) ? t : 1 - t;
}

// ─── Domain repetition ───────────────────────────────────────────────────────

// Repeat space every size units; returns position within [-size/2, size/2]
function repeatX(x, size) { return x - size * floor(x / size + 0.5); }
// Same as repeatX for the y axis
function repeatY(y, size) { return y - size * floor(y / size + 0.5); }

// ─── Rotational symmetry ─────────────────────────────────────────────────────

// Snap angle (0..1) to nearest of n sectors
function sectorAngle(angle, n) {
  var a    = angle * PI * 2;
  var step = (PI * 2) / n;
  return (round(a / step) * step) / (PI * 2);
}

// Fold into one sector (rotational symmetry without snapping)
function foldAngle(angle, n) {
  var a = ((angle % (1 / n)) * n);
  return a < 0.5 ? a : 1 - a;
}

// ─── Coordinate remapping ─────────────────────────────────────────────────────

// Map v from one range to another
function remap(v, inLo, inHi, outLo, outHi) {
  return outLo + (v - inLo) / (inHi - inLo) * (outHi - outLo);
}

// ─── Skew ────────────────────────────────────────────────────────────────────

// Shear x by y×amount
function skewX(x, y, amount) { return x + y * amount; }
// Shear y by x×amount
function skewY(x, y, amount) { return y + x * amount; }
