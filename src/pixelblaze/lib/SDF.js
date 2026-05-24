// SDF — Signed Distance Fields for 2D shape rendering
//
// Convention: negative = inside shape, positive = outside, 0 = on edge.
// Coordinates are typically in the 0..1 grid used by render2D.
//
// Assumes: sin, cos, atan2, sqrt, abs, floor, round, min, max, clamp, PI

// ─── Primitive shapes ────────────────────────────────────────────────────────

// Circle at (cx, cy) with radius r
function circle(px, py, cx, cy, r) {
  var dx = px - cx, dy = py - cy;
  return sqrt(dx * dx + dy * dy) - r;
}

// Axis-aligned rectangle (hw = half-width, hh = half-height)
function rect(px, py, cx, cy, hw, hh) {
  var dx = abs(px - cx) - hw;
  var dy = abs(py - cy) - hh;
  var ox = max(dx, 0), oy = max(dy, 0);
  return sqrt(ox * ox + oy * oy) + min(max(dx, dy), 0);
}

// Square; half is half-side length
function square(px, py, cx, cy, half) {
  return rect(px, py, cx, cy, half, half);
}

// Regular n-sided polygon, circumradius r
function polygon(px, py, cx, cy, r, n) {
  var dx = px - cx, dy = py - cy;
  var angle   = atan2(dy, dx);
  var dist    = sqrt(dx * dx + dy * dy);
  var a       = (PI * 2) / n;
  var nearest = round(angle / a) * a;
  return dist * cos(angle - nearest) - r * cos(PI / n);
}

// Equilateral triangle; r is circumradius
function triangle(px, py, cx, cy, r) {
  return polygon(px, py, cx, cy, r, 3);
}

// Distance from point to line segment (ax,ay)→(bx,by)
function segment(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var t  = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return sqrt(ex * ex + ey * ey);
}

// Signed distance to infinite line through (ax,ay)→(bx,by); left side is negative
function line(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var len = sqrt(dx * dx + dy * dy);
  return ((px - ax) * dy - (py - ay) * dx) / len;
}

// Hollow circle with given thickness
function ring(px, py, cx, cy, r, thickness) {
  var dx = px - cx, dy = py - cy;
  return abs(sqrt(dx * dx + dy * dy) - r) - thickness * 0.5;
}

// n-pointed star; ratio = inner/outer radius (try 0.4)
function star(px, py, cx, cy, r, n, ratio) {
  var dx    = px - cx, dy = py - cy;
  var angle = atan2(dy, dx);
  var dist  = sqrt(dx * dx + dy * dy);
  var step  = PI / n;
  var a = ((angle % (step * 2)) + step * 2) % (step * 2);
  if (a > step) a = step * 2 - a;
  var innerR = r * ratio;
  var edgeR = r * innerR / sqrt(innerR * innerR + r * r - 2 * innerR * r * cos(a - step * 0));
  return dist - edgeR;
}

// Pie / sector — wedge with half-angle ha (radians)
function pie(px, py, cx, cy, r, ha) {
  var dx = px - cx, dy = py - cy;
  var dist  = sqrt(dx * dx + dy * dy);
  var angle = abs(atan2(dy, dx));
  var c = cos(ha), s = sin(ha);
  var wx = dx * c + dy * s;
  var wy = -dx * s + dy * c;
  if (wy > 0 && abs(atan2(wy, wx)) < PI - ha) {
    return abs(dist - r);
  }
  var lx = c * r, ly = s * r;
  var q  = sqrt(min(
    (dx - lx) * (dx - lx) + (dy - ly) * (dy - ly),
    (dx + lx) * (dx + lx) + (dy + ly) * (dy + ly)
  ));
  return (dist < r && angle < ha) ? -q : q;
}

// Cross/plus — size = half-extent, thickness = arm width
function cross(px, py, cx, cy, size, thickness) {
  var dx = abs(px - cx), dy = abs(py - cy);
  var d1x = dx - size, d1y = dy - thickness;
  var d2x = dx - thickness, d2y = dy - size;
  var h1 = max(min(max(d1x, d1y), 0), 0);
  var h2 = max(min(max(d2x, d2y), 0), 0);
  var o1x = max(d1x, 0), o1y = max(d1y, 0);
  var o2x = max(d2x, 0), o2y = max(d2y, 0);
  return min(
    sqrt(o1x * o1x + o1y * o1y) - h1,
    sqrt(o2x * o2x + o2y * o2y) - h2
  );
}

// ─── Boolean operations ──────────────────────────────────────────────────────

// Minimum of two SDFs (OR)
function union(a, b)    { return min(a, b); }
// Maximum of two SDFs (AND)
function intersect(a, b) { return max(a, b); }
// Cut shape b from shape a
function subtract(a, b) { return max(a, -b); }

// Smooth union: blends boundary between shapes (k = blend radius)
function smoothUnion(a, b, k) {
  var h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// Blended subtraction
function smoothSubtract(a, b, k) {
  var h = max(k - abs(-a - b), 0) / k;
  return max(a, -b) + h * h * k * 0.25;
}

// Expand (+) or contract (-) a shape
function offset(d, amount) { return d - amount; }

// Turn a solid SDF into a shell
function annular(d, thickness) { return abs(d) - thickness; }

// ─── SDF → brightness mappings ───────────────────────────────────────────────

// Hard fill: 1 inside, 0 outside
function fill(d) { return d < 0 ? 1 : 0; }

// Antialiased fill (softness in coordinate units, try 0.02)
function softFill(d, softness) {
  return clamp(0.5 - d / softness, 0, 1);
}

// Glow centred on the edge; falls off over falloff units
function glow(d, falloff) {
  return clamp(1 - abs(d) / falloff, 0, 1);
}

// Full brightness inside + glow that fades outside
function fillGlow(d, falloff) {
  if (d < 0) return 1;
  return clamp(1 - d / falloff, 0, 1);
}

// Sharp border ring (width in coordinate units)
function border(d, width) {
  return abs(d) < width * 0.5 ? 1 : 0;
}

// Stepped bands radiating from SDF boundary (topographic map effect)
function bands(d, spacing) {
  return wave(d / spacing);
}
