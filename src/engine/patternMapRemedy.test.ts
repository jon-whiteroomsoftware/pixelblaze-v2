import { describe, it, expect } from 'vitest'
import { recommendedMapRemedy } from './patternMapRemedy'

describe('recommendedMapRemedy', () => {
  it('offers a demo whose recommended map matches the pattern dimension', () => {
    // NebulaSphere recommends sphere-volume (a 3D stock map). The recommended preview
    // pixel count is deliberately not carried — the map materializes to the device count.
    const remedy = recommendedMapRemedy('NebulaSphere', 3)
    expect(remedy).toEqual({
      mapId: 'sphere-volume',
      mapName: 'Sphere volume',
      mapDim: 3,
    })
  })

  it('does not offer a map of a different dimension than the pattern', () => {
    // The sphere map is 3D; a 2D pattern would not be fixed by installing it.
    expect(recommendedMapRemedy('NebulaSphere', 2)).toBeNull()
  })

  it('returns null for a user pattern / unknown demo (no recommendation layer)', () => {
    expect(recommendedMapRemedy(null, 3)).toBeNull()
    expect(recommendedMapRemedy('Some User Pattern', 3)).toBeNull()
  })

  it('returns null for a demo whose recommendation has no map or no pixel count', () => {
    // PulseLoom recommends a shapeId, not a mapId — nothing to install.
    expect(recommendedMapRemedy('PulseLoom', 1)).toBeNull()
  })
})
