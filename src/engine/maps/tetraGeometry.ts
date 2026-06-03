// Regular-tetrahedron geometry, shared by the Tetra shell/volume normal
// derivation (ADR-0012, preview-only). A four-sided die (d4) is a regular
// tetrahedron: 4 vertices, 4 triangular faces. This is the simplest case of the
// faceted-shell pattern the Cube and Star shells already use — only 4 fixed
// faces, so the per-point normal is just "which of the 4 faces does this point
// sit on".
//
// The vertices are four alternating corners of a cube (centred at the origin),
// the standard regular-tetrahedron embedding. Each face is the triangle of the
// three vertices OPPOSITE one vertex i; since the four unit vertices sum to zero,
// that face's centroid points along -V[i], which is therefore both the face's
// outward unit normal AND its centroid direction. The solid is convex, so a ray
// from the centre exits exactly once and `tetraSurfaceRadius` is the true
// boundary.
//
// Pure: no DOM/React. Normals are preview-only — never written to a map record
// nor sent to a controller (same status as centroidNormals / starGeometry).
import type { Vec3 } from '../centroidNormals'

function dot(u: Vec3, v: Vec3): number {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

// The four tetrahedron vertices on the unit sphere — alternating cube corners.
// Shared shape with the `.js` sources (same `1/sqrt(3)` scaling).
export const TETRA_VERTICES: Vec3[] = (() => {
  const s = 1 / Math.sqrt(3)
  return [
    [s, s, s],
    [s, -s, -s],
    [-s, s, -s],
    [-s, -s, s],
  ]
})()

export interface TetraFace {
  // Outward unit normal of the triangle plane (= the centroid direction for a
  // tetrahedron, both pointing along -V[i]).
  normal: Vec3
  // Plane support distance from the origin: dot(vertexOnFace, normal) (> 0).
  offset: number
  // Unit direction of the triangle centroid from the origin.
  centerDir: Vec3
}

// The four faces, each opposite a vertex. Built once (module-level constant).
export const TETRA_FACES: TetraFace[] = TETRA_VERTICES.map((vi, i) => {
  const normal: Vec3 = [-vi[0], -vi[1], -vi[2]] // unit (vi is unit), faces outward
  const onFace = TETRA_VERTICES[(i + 1) % 4] // any vertex of the opposite face
  return { normal, offset: dot(onFace, normal), centerDir: normal }
})

// One outward unit normal per Tetra (shell) position: the normal of the face the
// point sits on, found as the face whose centroid direction is angularly nearest
// the point's direction from the cloud centre. Aspect-preserving normalization is
// a uniform-scale affine map, so directions (and thus this classification) carry
// over from raw geometry to the normalized preview positions unchanged. A point
// at the centre has no direction and falls back to facing the camera (+z), so it
// never fades.
export function tetraShellNormals(positions: Vec3[]): Vec3[] {
  if (positions.length === 0) return []
  const c: Vec3 = [0, 0, 0]
  for (const p of positions) {
    c[0] += p[0]
    c[1] += p[1]
    c[2] += p[2]
  }
  c[0] /= positions.length
  c[1] /= positions.length
  c[2] /= positions.length

  return positions.map((p) => {
    const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
    const len = Math.hypot(d[0], d[1], d[2])
    if (len === 0) return [0, 0, 1]
    const u: Vec3 = [d[0] / len, d[1] / len, d[2] / len]
    let best = -Infinity
    let normal: Vec3 = [0, 0, 1]
    for (const f of TETRA_FACES) {
      const dd = dot(u, f.centerDir)
      if (dd > best) {
        best = dd
        normal = f.normal
      }
    }
    return normal
  })
}

// Radius from the origin to the tetrahedron surface along a unit direction `u`:
// the nearest positive crossing of the four face planes (the solid is convex, so
// that minimum is the true exit). Used by the Tetra shell/volume engine tests to
// place and bound points against the surface.
export function tetraSurfaceRadius(u: Vec3): number {
  let r = Infinity
  for (const f of TETRA_FACES) {
    const d = dot(u, f.normal)
    if (d > 1e-12) {
      const t = f.offset / d
      if (t < r) r = t
    }
  }
  return r
}
