import {
  layoutOptions,
  selectionForOption,
  selectedOptionId,
  resolveLayoutSelection,
  type LayoutSource,
} from './layout'

const SOURCE: LayoutSource = {
  shapes: [
    { id: 'line', name: 'Line', displayDim: 1 },
    { id: 'ring', name: 'Ring', displayDim: 2 },
  ],
  maps: [
    { id: 'plane', name: 'Plane', dim: 2 },
    { id: 'cube', name: 'Cube', dim: 3 },
  ],
}

describe('layoutOptions (sample-arity filter)', () => {
  it('offers a 1D pattern every shape and no map', () => {
    const opts = layoutOptions(1, SOURCE)
    expect(opts.map((o) => o.id)).toEqual(['line', 'ring'])
    expect(opts.every((o) => o.kind === 'shape')).toBe(true)
  })

  it('offers a ring (2D display) to a 1D pattern despite its display dim', () => {
    const ring = layoutOptions(1, SOURCE).find((o) => o.id === 'ring')
    expect(ring).toMatchObject({ kind: 'shape', displayDim: 2 })
  })

  it('offers a 2D pattern only dim-2 maps, no shapes', () => {
    const opts = layoutOptions(2, SOURCE)
    expect(opts.map((o) => o.id)).toEqual(['plane'])
    expect(opts[0].kind).toBe('map')
  })

  it('offers a 3D pattern only the dim-3 map', () => {
    expect(layoutOptions(3, SOURCE).map((o) => o.id)).toEqual(['cube'])
  })
})

describe('selectionForOption (routing)', () => {
  it('routes a shape choice to shapeId', () => {
    expect(selectionForOption({ kind: 'shape', id: 'ring', name: 'Ring', displayDim: 2 })).toEqual({
      shapeId: 'ring',
    })
  })

  it('routes a map choice to mapId', () => {
    expect(selectionForOption({ kind: 'map', id: 'plane', name: 'Plane', displayDim: 2 })).toEqual({
      mapId: 'plane',
    })
  })
})

describe('selectedOptionId', () => {
  it('reads shapeId for a 1D pattern', () => {
    expect(selectedOptionId({ shapeId: 'ring', mapId: 'plane' }, 1)).toBe('ring')
  })
  it('reads mapId for a 2D pattern', () => {
    expect(selectedOptionId({ shapeId: 'ring', mapId: 'plane' }, 2)).toBe('plane')
  })
})

describe('resolveLayoutSelection (open / restore)', () => {
  it('restores a valid persisted 1D shape', () => {
    expect(resolveLayoutSelection({ shapeId: 'ring' }, 1, SOURCE)).toEqual({ shapeId: 'ring' })
  })

  it('falls back to the first shape when nothing persisted (1D default = line)', () => {
    expect(resolveLayoutSelection({}, 1, SOURCE)).toEqual({ shapeId: 'line' })
  })

  it('falls back to the default when the persisted id is no longer offered', () => {
    expect(resolveLayoutSelection({ shapeId: 'helix' }, 1, SOURCE)).toEqual({ shapeId: 'line' })
  })

  it('restores a persisted map for a 2D pattern', () => {
    expect(resolveLayoutSelection({ mapId: 'plane' }, 2, SOURCE)).toEqual({ mapId: 'plane' })
  })

  it('ignores a persisted shapeId when the pattern is 2D (uses map default)', () => {
    expect(resolveLayoutSelection({ shapeId: 'ring' }, 2, SOURCE)).toEqual({ mapId: 'plane' })
  })

  it('returns empty when no options exist for the dimension', () => {
    expect(resolveLayoutSelection({}, 3, { shapes: [], maps: [] })).toEqual({})
  })
})
