import type { MapPoint, PixelMap } from './types'

export interface CubeParams {
  side: number // points per axis; the map holds side³ pixels
}

// Normalize an integer position on [0, n) into [0, 1]; a single-cell axis maps
// to the centre (0.5) so a degenerate cube still sits at the origin.
function norm(i: number, n: number): number {
  return n > 1 ? i / (n - 1) : 0.5
}

// One pixel of a side×side×side lattice, x-fastest then y then z. `sample` (fed
// to render3D) and the drawn `pos` coincide, both normalized [0,1]³.
export function cubePoint(index: number, params: CubeParams): MapPoint {
  const { side } = params
  const x = index % side
  const y = Math.floor(index / side) % side
  const z = Math.floor(index / (side * side))
  const xyz: [number, number, number] = [norm(x, side), norm(y, side), norm(z, side)]
  return { sample: [...xyz], pos: xyz }
}

// The pixel count a cube map models: side³ (the renderer's freeze guard still
// caps the total). Exposed so the preview can size the run loop to the lattice.
export function cubePixelCount(side: number): number {
  return side * side * side
}

// Stock 3D cube lattice — the minimal 3D map so render3D patterns have a layout
// to draw on. dim:3, so `layoutOptions` offers it only to 3D patterns.
export function createCubeMap(params: CubeParams, opts: { id?: string; name?: string } = {}): PixelMap {
  return {
    id: opts.id ?? 'cube',
    name: opts.name ?? 'Cube',
    builtin: true,
    dim: 3,
    resolve(pixelCount: number): MapPoint[] {
      const points: MapPoint[] = []
      for (let i = 0; i < pixelCount; i++) points.push(cubePoint(i, params))
      return points
    },
  }
}
