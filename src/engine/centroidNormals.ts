// Generic centroid-derived surface normals (ADR-0011, preview-only).
//
// A baked 3D point cloud (the Sphere stock map) arrives as `xyz` with no
// formula, so the preview re-derives a per-point outward normal as
// `normalize(pos − centroid)`. This is exact for a CONVEX SHELL (a sphere) and
// is why eligibility is provenance-gated: the stock catalogue tags the sphere
// with the `centroid` normal recipe, vouching that the centroid math is honest
// for it. A cloud carrying no recipe (a torus, a measured tree) never reaches
// this code.
//
// Pure: no DOM/React. The normals are preview-only — never written to a map
// record nor sent to a controller (the same status as the analytic surface
// normals in surfaces.ts / shapes.ts).

export type Vec3 = [number, number, number]

// The arithmetic-mean centre of the positions, or the origin for an empty cloud.
export function centroid(positions: Vec3[]): Vec3 {
  if (positions.length === 0) return [0, 0, 0]
  let sx = 0
  let sy = 0
  let sz = 0
  for (const [x, y, z] of positions) {
    sx += x
    sy += y
    sz += z
  }
  const n = positions.length
  return [sx / n, sy / n, sz / n]
}

// One outward unit normal per position: the radial direction from the centroid,
// `normalize(pos − centroid)`. A point sitting exactly at the centroid has no
// defined radial direction, so it falls back to facing the camera (+z) — it
// never fades, the safe choice for a degenerate point.
export function centroidNormals(positions: Vec3[]): Vec3[] {
  const c = centroid(positions)
  return positions.map(([x, y, z]) => {
    const dx = x - c[0]
    const dy = y - c[1]
    const dz = z - c[2]
    const len = Math.hypot(dx, dy, dz)
    if (len === 0) return [0, 0, 1]
    return [dx / len, dy / len, dz / len]
  })
}

// Per-FACE outward normals for a faceted shell (the Cube shell, ADR-0012): the
// axis-aligned unit vector along the DOMINANT axis of `pos − centroid`. A point
// on a cube face is pinned to the centre's extreme on one axis (offset ±half the
// span) while its in-face offsets stay strictly smaller, so the dominant axis is
// always the face's own axis — yielding the exact ±x/±y/±z face normal, with no
// rounding of the centroid-radial direction. A point sitting at the centroid has
// no dominant axis, so it falls back to facing the camera (+z) and never fades.
// Preview-only (ADR-0011) — never written to a map record nor sent to hardware.
export function faceNormals(positions: Vec3[]): Vec3[] {
  const c = centroid(positions)
  return positions.map(([x, y, z]) => {
    const d = [x - c[0], y - c[1], z - c[2]]
    let axis = -1
    let best = 0
    for (let a = 0; a < 3; a++) {
      const m = Math.abs(d[a])
      if (m > best) {
        best = m
        axis = a
      }
    }
    if (axis === -1) return [0, 0, 1]
    const n: Vec3 = [0, 0, 0]
    n[axis] = d[axis] > 0 ? 1 : -1
    return n
  })
}
