// Stellated-icosahedron geometry, shared by the Star shell/volume normal
// derivation (ADR-0012, preview-only). An icosahedron body with a pyramidal
// spike erected over each of its 20 triangular faces; each spike contributes 3
// slanted triangular faces, so the stellated SURFACE is 60 triangles. This
// module reconstructs those 60 faces — vertices, outward unit normal, and the
// unit direction of the face centroid from the origin — so the preview can hand
// each Star (shell) point its own face's normal (a faceted look, not the smooth
// centroid radial a sphere gets).
//
// The icosahedron is centrally symmetric and the stellation is radial, so the
// solid is star-shaped about the origin: every ray from the centre exits the
// surface exactly once. That is what makes both the per-face normal lookup
// (angular nearest face) and the volume ray-cast (nearest exit plane) honest.
//
// Pure: no DOM/React. Normals are preview-only — never written to a map record
// nor sent to a controller (same status as centroidNormals / surfaces.ts).
import type { Vec3 } from '../centroidNormals'

// How far a spike tip reaches beyond the unit body — must match the raw `tip`
// in the star-shell/star-volume `.js` sources so the derived faces line up with
// the generated points.
export const STAR_TIP = 1.9

export interface StarFace {
  // The triangle's three corners in raw geometry space.
  a: Vec3
  b: Vec3
  c: Vec3
  // Outward unit normal of the triangle plane.
  normal: Vec3
  // Plane support distance from the origin: dot(a, normal) (> 0, faces outward).
  offset: number
  // Unit direction of the triangle centroid from the origin — the angular cell a
  // surface point in this face falls into.
  centerDir: Vec3
}

function sub(p: Vec3, q: Vec3): Vec3 {
  return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
}
function cross(u: Vec3, v: Vec3): Vec3 {
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}
function dot(u: Vec3, v: Vec3): number {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}
function norm(u: Vec3): Vec3 {
  const l = Math.hypot(u[0], u[1], u[2])
  return l === 0 ? [0, 0, 0] : [u[0] / l, u[1] / l, u[2] / l]
}

// The 12 icosahedron vertices on the unit sphere (cyclic permutations of
// (0, ±1, ±phi)). Shared shape with the `.js` sources.
function icosaVertices(): Vec3[] {
  const phi = (1 + Math.sqrt(5)) / 2
  const raw: Vec3[] = [
    [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
    [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
    [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
  ]
  return raw.map(norm)
}

// Build the 60 stellation faces once (module-level constant).
export const STAR_FACES: StarFace[] = (() => {
  const V = icosaVertices()
  const dist2 = (p: Vec3, q: Vec3) => {
    const d = sub(p, q)
    return d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  }
  // Icosahedron edge length² is the smallest pairwise vertex distance.
  let minD2 = Infinity
  for (let a = 0; a < 12; a++)
    for (let b = a + 1; b < 12; b++) minD2 = Math.min(minD2, dist2(V[a], V[b]))
  const adj = minD2 * 1.1

  const faces: StarFace[] = []
  const pushTriangle = (a: Vec3, b: Vec3, c: Vec3) => {
    const center: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    let n = norm(cross(sub(b, a), sub(c, a)))
    if (dot(n, center) < 0) n = [-n[0], -n[1], -n[2]] // orient outward
    faces.push({ a, b, c, normal: n, offset: dot(a, n), centerDir: norm(center) })
  }

  // Each icosahedron face (a mutually-adjacent vertex triple) gets an apex pushed
  // out along the face normal; the spike's 3 slanted triangles are the faces.
  for (let a = 0; a < 12; a++)
    for (let b = a + 1; b < 12; b++)
      for (let c = b + 1; c < 12; c++)
        if (dist2(V[a], V[b]) <= adj && dist2(V[a], V[c]) <= adj && dist2(V[b], V[c]) <= adj) {
          const fc: Vec3 = [
            (V[a][0] + V[b][0] + V[c][0]) / 3,
            (V[a][1] + V[b][1] + V[c][1]) / 3,
            (V[a][2] + V[b][2] + V[c][2]) / 3,
          ]
          const apexDir = norm(fc)
          const apex: Vec3 = [apexDir[0] * STAR_TIP, apexDir[1] * STAR_TIP, apexDir[2] * STAR_TIP]
          pushTriangle(V[a], V[b], apex)
          pushTriangle(V[b], V[c], apex)
          pushTriangle(V[c], V[a], apex)
        }
  return faces
})()

// One outward unit normal per Star (shell) position: the normal of the face the
// point sits on, found as the face whose centroid direction is angularly nearest
// the point's direction from the cloud centre. Aspect-preserving normalization
// is a uniform-scale affine map, so directions (and thus this classification and
// the returned normals) carry over from raw geometry to the normalized preview
// positions unchanged. A point at the centre has no direction and falls back to
// facing the camera (+z), so it never fades.
export function starShellNormals(positions: Vec3[]): Vec3[] {
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
    const u = norm(sub(p, c))
    if (u[0] === 0 && u[1] === 0 && u[2] === 0) return [0, 0, 1] as Vec3
    let best = -Infinity
    let normal: Vec3 = [0, 0, 1]
    for (const f of STAR_FACES) {
      const d = dot(u, f.centerDir)
      if (d > best) {
        best = d
        normal = f.normal
      }
    }
    return normal
  })
}

// Radius from the origin to the stellated surface along a unit direction `u`:
// the distance to the one triangle the ray from the centre actually passes
// through (Möller–Trumbore). The solid is star-shaped, so every ray exits through
// exactly one of the 60 faces — this is the true boundary even where the solid is
// concave (an infinite-plane minimum would cut the spikes short). Used by the
// Star shell/volume engine tests to place and bound points against the surface.
export function starSurfaceRadius(u: Vec3): number {
  for (const f of STAR_FACES) {
    const t = rayTriangle(u, f.a, f.b, f.c)
    if (t !== null) return t
  }
  return Infinity
}

// Ray–triangle intersection distance for a ray from the origin along `u`, or null
// if it misses (Möller–Trumbore).
function rayTriangle(u: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const p = cross(u, e2)
  const det = dot(e1, p)
  if (Math.abs(det) < 1e-12) return null
  const inv = 1 / det
  const tvec: Vec3 = [-a[0], -a[1], -a[2]] // origin − a
  const su = dot(tvec, p) * inv
  if (su < 0 || su > 1) return null
  const q = cross(tvec, e1)
  const sv = dot(u, q) * inv
  if (sv < 0 || su + sv > 1) return null
  const t = dot(e2, q) * inv
  return t > 1e-9 ? t : null
}
