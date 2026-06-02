import {
  resolveLayout,
  type LayoutSource,
  type ResolveLayoutDeps,
  type ResolveLayoutInput,
} from './layout'
import type { MapPoint, PixelMap } from './maps'

// The Layout catalogue under test: line/ring shapes, flat/cylinder surfaces, and
// a spread of maps covering every resolve branch (plane, 2D cloud, cube lattice,
// 3D shells with different normal recipes, an irregular 3D cloud).
const SOURCE: LayoutSource = {
  shapes: [
    { id: 'line', name: 'Line', displayDim: 1 },
    { id: 'ring', name: 'Ring', displayDim: 2 },
    { id: 'pole', name: 'Pole', displayDim: 3 },
  ],
  surfaces: [
    { id: 'flat', name: 'Flat', displayDim: 2, needsGrid: false },
    { id: 'cylinder', name: 'Cylinder', displayDim: 3, needsGrid: true },
  ],
  maps: [
    { id: 'plane', name: 'Square', dim: 2, wrappable: true },
    { id: 'ring2d', name: 'Ring', dim: 2, wrappable: false },
    { id: 'cube', name: 'Cube', dim: 3 },
    { id: 'cube-shell', name: 'Cube (shell)', dim: 3 },
    { id: 'star-shell', name: 'Star (shell)', dim: 3 },
    { id: 'sphere', name: 'Sphere', dim: 3 },
    { id: 'helix', name: 'Helix', dim: 3 },
  ],
}

// A fake map whose resolve() emits `pixelCount` points already inside [0,1], so
// the real aspect-normalization pass (Contain) is a benign pass-through and the
// branch logic — not the geometry — is what each test exercises.
function makeMap(opts: Partial<PixelMap> & Pick<PixelMap, 'id' | 'dim'>): PixelMap {
  const is3D = opts.dim === 3
  return {
    name: opts.id,
    builtin: true,
    // Default: no clean grid. The Square overrides this below to a 1-row strip so
    // the cylinder-wrap branch has a grid to lift, mirroring a wrappable stock map.
    gridDims: () => null,
    ...opts,
    resolve(pixelCount: number): MapPoint[] {
      return Array.from({ length: pixelCount }, (_, i) => {
        const t = pixelCount > 1 ? i / (pixelCount - 1) : 0
        const pos = is3D ? ([t, t, t] as [number, number, number]) : ([t, t] as [number, number])
        const sample = is3D ? [t, t, t] : [t, t]
        return { sample, pos }
      })
    },
  }
}

const MAPS: Record<string, PixelMap> = {
  plane: makeMap({ id: 'plane', dim: 2, gridDims: (count) => ({ cols: count, rows: 1 }) }),
  ring2d: makeMap({ id: 'ring2d', dim: 2, bakedCount: 60 }),
  cube: makeMap({ id: 'cube', dim: 3 }),
  'cube-shell': makeMap({ id: 'cube-shell', dim: 3, normals: 'face' }),
  'star-shell': makeMap({ id: 'star-shell', dim: 3, normals: 'star' }),
  sphere: makeMap({ id: 'sphere', dim: 3, normals: 'centroid' }),
  helix: makeMap({ id: 'helix', dim: 3 }),
}

const deps: ResolveLayoutDeps = {
  resolveMap: (mapId) => MAPS[mapId ?? 'plane'] ?? MAPS.plane,
  defaultCountForDim: (dim) => (dim === 1 ? 100 : dim === 2 ? 256 : 512),
}

function input(over: Partial<ResolveLayoutInput>): ResolveLayoutInput {
  return {
    selection: {},
    nativeDim: 2,
    source: SOURCE,
    persistedCount: null,
    normalizeMode: 'contain',
    poleCols: null,
    shapeDefaultCount: 100,
    ...over,
  }
}

describe('resolveLayout — 1D shapes', () => {
  it('line draws through the 2D channel with an empty sample', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(1)
    expect(r.draw.positions).toHaveLength(r.pixelCount)
    expect(r.mapPoints.every((p) => p.sample.length === 0)).toBe(true)
    expect(r.layoutLabel).toBeNull()
  })

  it('ring is a 2D-display shape, still the 2D channel', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'ring' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
  })

  it('pole wraps a 1D strip into the 3D channel with normals', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'pole' } }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.displayDim).toBe(3)
    if (r.draw.kind === '3d') {
      expect(r.draw.normals).not.toBeNull()
      expect(r.draw.normals).toHaveLength(r.pixelCount)
    }
  })

  it('honours the persisted count, else the shape default', () => {
    expect(resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' } }), deps).pixelCount).toBe(100)
    expect(
      resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' }, persistedCount: 42 }), deps).pixelCount,
    ).toBe(42)
  })
})

describe('resolveLayout — 2D maps', () => {
  it('plane reports a cols×rows label and draws 2D', () => {
    const r = resolveLayout(input({ selection: { mapId: 'plane', surfaceId: 'flat' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
    expect(r.layoutLabel).toMatch(/^\d+×\d+$/)
    expect(r.pixelCount).toBe(256) // dim-2 default
  })

  it('a 2D cloud defaults its count to the baked length', () => {
    const r = resolveLayout(input({ selection: { mapId: 'ring2d', surfaceId: 'flat' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.pixelCount).toBe(60)
    expect(r.layoutLabel).toBeNull()
  })

  it('cylinder surface lifts a wrappable map into the 3D channel', () => {
    const r = resolveLayout(input({ selection: { mapId: 'plane', surfaceId: 'cylinder' } }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.displayDim).toBe(3)
    if (r.draw.kind === '3d') expect(r.draw.normals).not.toBeNull()
    // The map keeps owning `sample`; only `pos` is the surface's.
    expect(r.mapPoints[0].sample).toHaveLength(2)
  })

  it('cylinder on a non-grid map stays flat 2D', () => {
    const r = resolveLayout(input({ selection: { mapId: 'ring2d', surfaceId: 'cylinder' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
  })
})

describe('resolveLayout — 3D maps', () => {
  it('cube squares the count up and labels s×s×s', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId: 'cube' }, persistedCount: 512 }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.layoutLabel).toBe('8×8×8')
    expect(r.pixelCount).toBe(512)
  })

  it.each([
    ['cube-shell', 'face normals'],
    ['star-shell', 'star normals'],
    ['sphere', 'centroid normals'],
  ])('a solid-eligible %s map carries normals (%s)', (mapId) => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId } }), deps)
    expect(r.draw.kind).toBe('3d')
    if (r.draw.kind === '3d') {
      expect(r.draw.normals).not.toBeNull()
      expect(r.draw.normals).toHaveLength(r.pixelCount)
    }
  })

  it('a non-eligible 3D cloud (helix) carries no normals', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId: 'helix' } }), deps)
    expect(r.draw.kind).toBe('3d')
    if (r.draw.kind === '3d') expect(r.draw.normals).toBeNull()
  })
})

describe('resolveLayout — selection correction & precedence', () => {
  it('corrects a stale 1D shape on a 2D pattern and reports it', () => {
    // A 2D pattern carrying only a stale shapeId gets a map + flat surface.
    const r = resolveLayout(input({ nativeDim: 2, selection: { shapeId: 'line' } }), deps)
    expect(r.correctedSelection.mapId).toBe('plane')
    expect(r.correctedSelection.shapeId).toBeUndefined()
    expect(r.draw.kind).toBe('2d')
  })

  it('a demo recommendation sets the on-open map when none is persisted', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: {}, recommendedMapId: 'sphere' }), deps)
    expect(r.correctedSelection.mapId).toBe('sphere')
  })

  it('a demo recommended count beats the per-dim default', () => {
    const r = resolveLayout(
      input({ nativeDim: 3, selection: { mapId: 'helix' }, recommendedCount: 4096 }),
      deps,
    )
    expect(r.pixelCount).toBe(4096)
  })

  it('a persisted count beats a recommendation', () => {
    const r = resolveLayout(
      input({ nativeDim: 3, selection: { mapId: 'helix' }, persistedCount: 999, recommendedCount: 4096 }),
      deps,
    )
    expect(r.pixelCount).toBe(999)
  })
})
