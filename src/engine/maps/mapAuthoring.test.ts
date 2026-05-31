import {
  MAP_SKELETON,
  parseMapSource,
  isMapOpenable,
  isPristineToBaseline,
  mapTemplates,
} from './mapAuthoring'
import { STOCK_MAP_SPECS } from './stockCatalogue'

describe('MAP_SKELETON', () => {
  it('is a valid map source that parses good', () => {
    expect(parseMapSource(MAP_SKELETON)).toEqual([])
  })
})

describe('parseMapSource', () => {
  it('accepts an anonymous function expression source', () => {
    expect(parseMapSource('function(n){ return [[0,0]] }')).toEqual([])
  })

  it('accepts every stock map source verbatim', () => {
    for (const spec of STOCK_MAP_SPECS) {
      expect(parseMapSource(spec.source)).toEqual([])
    }
  })

  it('reports a positioned error for malformed JS', () => {
    const errors = parseMapSource('function(n){ return [[0,0] }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBeTruthy()
    expect(errors[0].message).not.toMatch(/\(\d+:\d+\)$/)
  })

  it('does not apply Pixelblaze dialect rules (let/const are valid plain JS)', () => {
    // validateSource would reject `let`; the parse-only map check must not.
    expect(parseMapSource('function(n){ let x = 1; return [[x,0]] }')).toEqual([])
  })
})

describe('isMapOpenable', () => {
  it('is true when a source string is present', () => {
    expect(isMapOpenable({ source: 'function(n){ return [] }' })).toBe(true)
    expect(isMapOpenable({ source: '' })).toBe(true)
  })

  it('is false when source is absent (stock maps)', () => {
    expect(isMapOpenable({})).toBe(false)
    expect(isMapOpenable({ source: undefined })).toBe(false)
  })
})

describe('isPristineToBaseline', () => {
  it('is true only when byte-identical to the baseline', () => {
    expect(isPristineToBaseline('abc', 'abc')).toBe(true)
    expect(isPristineToBaseline('abc ', 'abc')).toBe(false)
    expect(isPristineToBaseline('abc', 'abd')).toBe(false)
  })
})

describe('mapTemplates', () => {
  it('lists every source-backed stock map with verbatim source', () => {
    const templates = mapTemplates()
    expect(templates.map((t) => t.id)).toEqual(STOCK_MAP_SPECS.map((s) => s.id))
    for (const t of templates) {
      const spec = STOCK_MAP_SPECS.find((s) => s.id === t.id)!
      expect(t.source).toBe(spec.source)
      expect(t.name).toBe(spec.name)
    }
  })
})
