import type { PixelMap } from './types'
import { createCustomMap } from './custom'

// Stock example clouds (originally seeded into the `maps` IDB store by #140,
// relocated to the stock catalogue by #141): genuinely irregular geometry — two
// 3D point clouds and a non-rectangular 2D arrangement. They ship with the IDE
// (stock provenance per CONTEXT.md), so they are NOT listed in "Your Maps"; they
// replay a baked coordinate array rather than regenerate, but that mechanism is
// internal. They double as the eventual builder templates. All coords are
// normalized to [0,1] per axis (map space).

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4
}

// A 3D helix point cloud: a spiral climbing y, radius 0.4 about the vertical
// axis. Irregular (not a lattice), arity 3 → 3D.
function helixPoints(count: number, turns: number): number[][] {
  const pts: number[][] = []
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0
    const a = t * turns * 2 * Math.PI
    pts.push([round(0.5 + 0.4 * Math.cos(a)), round(t), round(0.5 + 0.4 * Math.sin(a))])
  }
  return pts
}

// A 3D sphere shell via the Fibonacci lattice — evenly distributed points on a
// sphere, normalized into the unit cube. Genuinely irregular index ordering.
function spherePoints(count: number): number[][] {
  const pts: number[][] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = count > 1 ? 1 - (i / (count - 1)) * 2 : 0 // [1,-1]
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const a = golden * i
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    // Map the [-1,1] cube into [0,1].
    pts.push([round((x + 1) / 2), round((y + 1) / 2), round((z + 1) / 2)])
  }
  return pts
}

// A 2D ring: points evenly around a circle of radius 0.45 centred at (0.5,0.5).
// Non-rectangular — the consume path must draw these without assuming a grid.
function ringPoints(count: number): number[][] {
  const pts: number[][] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * 2 * Math.PI
    pts.push([round(0.5 + 0.45 * Math.cos(a)), round(0.5 + 0.45 * Math.sin(a))])
  }
  return pts
}

interface SeedSpec {
  id: string
  name: string
  points: number[][]
}

const SEED_SPECS: SeedSpec[] = [
  { id: 'seed-helix-3d', name: 'Helix (cloud)', points: helixPoints(120, 5) },
  { id: 'seed-sphere-3d', name: 'Sphere (cloud)', points: spherePoints(150) },
  { id: 'seed-ring-2d', name: 'Ring', points: ringPoints(60) },
]

// The example clouds as stock PixelMaps — baked replay (ADR-0007), appended to
// STOCK_MAPS. They are stock by provenance, so the consume path still treats
// them as custom (non-builtin) point clouds for drawing.
export const SEED_STOCK_MAPS: PixelMap[] = SEED_SPECS.map((s) =>
  createCustomMap(s.points, { id: s.id, name: s.name }),
)

// The ids of the relocated clouds — used to prune rows that the #140 seeder
// persisted into the `maps` IDB store before they became stock (migration).
export const SEED_MAP_IDS: string[] = SEED_SPECS.map((s) => s.id)
