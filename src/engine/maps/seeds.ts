import type { MapRecord } from '../storage'
import { inferDim } from './custom'

// Seeded stock custom maps (issue #140): genuinely irregular geometry — a 3D
// point cloud and a non-rectangular 2D arrangement — baked as real `maps`-store
// rows via the production createMap path, before any authoring UI exists. They
// prove the custom-map consume path end to end and double as the eventual
// builder templates. All coords are normalized to [0,1] per axis (map space).

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
  { id: 'seed-helix-3d', name: 'Helix (3D cloud)', points: helixPoints(120, 5) },
  { id: 'seed-sphere-3d', name: 'Sphere (3D cloud)', points: spherePoints(150) },
  { id: 'seed-ring-2d', name: 'Ring (2D)', points: ringPoints(60) },
]

// The seed maps as ready-to-persist MapRecords. `updatedAt` is stamped at seed
// time so freshly seeded rows sort to the top of the map list like any new map.
export function seedMapRecords(now: number = Date.now()): MapRecord[] {
  return SEED_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    dim: inferDim(s.points),
    generator: 'custom',
    params: {},
    points: s.points,
    updatedAt: now,
  }))
}
