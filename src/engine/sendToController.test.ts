import { describe, it, expect } from 'vitest'
import {
  mapDimension,
  describeSendToController,
  describeSendMap,
  isAlreadyPushed,
  describeSendAction,
} from './sendToController'
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
    const gate = describeSendToController({ status: { kind: 'no-extension' } })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/connect a controller/i)
  })

  it('enables when connected, compiling, and dirty', () => {
    expect(describeSendToController({ status: connected })).toEqual({ enabled: true })
  })

  // A pattern/map dimensionality mismatch no longer hard-disables Send — it is a soft,
  // push-past warning surfaced in the preflight popover (see preflight.test.ts). The gate
  // here is intentionally dim-agnostic.
  it('enables regardless of dimensionality (the dim concern moved to preflight)', () => {
    expect(describeSendToController({ status: connected }).enabled).toBe(true)
  })

  it('disables when the pattern does not compile cleanly', () => {
    const gate = describeSendToController({ status: connected, compileStatus: 'broken' })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/errors/i)
  })

  it('disables when the source already matches the last push (nothing to send)', () => {
    const gate = describeSendToController({ status: connected, alreadyPushed: true })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/no changes/i)
  })
})

describe('isAlreadyPushed (mode-split dirty gate)', () => {
  it('never matches an empty source', () => {
    expect(isAlreadyPushed({ mode: 'run', source: '', lastRunSource: '' })).toBe(false)
  })

  it('matches the run record only in run mode', () => {
    const args = { source: 'abc', lastRunSource: 'abc', lastSavedSource: undefined }
    expect(isAlreadyPushed({ ...args, mode: 'run' })).toBe(true)
    // A clean run does not satisfy a pending save — arming save re-enables Send.
    expect(isAlreadyPushed({ ...args, mode: 'save' })).toBe(false)
  })

  it('matches the save record only in save mode', () => {
    const args = { source: 'abc', lastRunSource: undefined, lastSavedSource: 'abc' }
    expect(isAlreadyPushed({ ...args, mode: 'save' })).toBe(true)
    expect(isAlreadyPushed({ ...args, mode: 'run' })).toBe(false)
  })

  it('does not match when the source has changed since the push', () => {
    expect(isAlreadyPushed({ mode: 'run', source: 'xyz', lastRunSource: 'abc' })).toBe(false)
  })
})

describe('describeSendAction', () => {
  it('plays in run mode and saves in save mode', () => {
    expect(describeSendAction('run', 'Desk').tooltip).toBe('Play on Desk')
    expect(describeSendAction('save', 'Desk').tooltip).toBe('Save to Desk')
  })
})

describe('describeSendMap', () => {
  it('enables when connected and the map has baked points', () => {
    expect(describeSendMap({ status: connected, hasBakedPoints: true })).toEqual({ enabled: true })
  })

  it('disables when no Controller is connected', () => {
    const gate = describeSendMap({ status: { kind: 'extension-present' }, hasBakedPoints: true })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/connect a controller/i)
  })

  it('disables when the map has no baked points yet', () => {
    const gate = describeSendMap({ status: connected, hasBakedPoints: false })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/bake/i)
  })

  it('disables when the map already matches the last push', () => {
    const gate = describeSendMap({ status: connected, hasBakedPoints: true, alreadyPushed: true })
    expect(gate.enabled).toBe(false)
    expect(gate.reason).toMatch(/no changes/i)
  })
})
