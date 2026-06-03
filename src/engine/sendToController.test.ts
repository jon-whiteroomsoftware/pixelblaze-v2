import { describe, it, expect } from 'vitest'
import { mapDimension, describeSendToController } from './sendToController'
import type { ControllerStatus } from './ControllerProvider'

const connected: ControllerStatus = {
  kind: 'connected',
  controller: { id: 'c1', address: '10.0.0.9' },
}

describe('mapDimension', () => {
  it('derives the dimension from the coordinate arity', () => {
    expect(mapDimension([[0], [1]])).toBe(1)
    expect(mapDimension([[0, 0], [1, 1]])).toBe(2)
    expect(mapDimension([[0, 0, 0]])).toBe(3)
  })

  it('returns null for an empty, absent, or malformed map', () => {
    expect(mapDimension(null)).toBeNull()
    expect(mapDimension(undefined)).toBeNull()
    expect(mapDimension([])).toBeNull()
    expect(mapDimension([[0, 0, 0, 0]])).toBeNull()
  })
})

describe('describeSendToController', () => {
  it('disables when no Controller is connected, explaining why', () => {
    const gate = describeSendToController({
      status: { kind: 'no-extension' },
      patternDim: 2,
      mapDim: 2,
    })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/connect a controller/i)
  })

  it('enables when connected and the dimensions match', () => {
    expect(describeSendToController({ status: connected, patternDim: 2, mapDim: 2 })).toEqual({
      enabled: true,
    })
  })

  it('disables on a dimensionality mismatch, naming both dimensions', () => {
    const gate = describeSendToController({ status: connected, patternDim: 2, mapDim: 1 })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toContain('2D')
    expect(gate.reason).toContain('1D')
  })

  it('enables when the map dimension is unknown (cannot prove a mismatch)', () => {
    expect(
      describeSendToController({ status: connected, patternDim: 3, mapDim: null }).enabled,
    ).toBe(true)
  })
})
