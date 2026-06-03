import {
  getControllerProvider,
  setControllerProvider,
  resetControllerProvider,
} from './controllerProviderRegistry'
import { NullControllerProvider } from './ControllerProvider'

describe('controllerProviderRegistry', () => {
  afterEach(() => resetControllerProvider())

  it('defaults to a no-helper NullControllerProvider', () => {
    const p = getControllerProvider()
    expect(p).toBeInstanceOf(NullControllerProvider)
    expect(p.getStatus()).toEqual({ kind: 'no-extension' })
  })

  it('swaps in a provided backend', () => {
    const fake = new NullControllerProvider()
    setControllerProvider(fake)
    expect(getControllerProvider()).toBe(fake)
  })

  it('reset restores a fresh default provider', () => {
    const fake = new NullControllerProvider()
    setControllerProvider(fake)
    resetControllerProvider()
    expect(getControllerProvider()).not.toBe(fake)
    expect(getControllerProvider()).toBeInstanceOf(NullControllerProvider)
  })
})
