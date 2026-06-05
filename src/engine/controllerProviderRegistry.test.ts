import {
  getControllerProvider,
  setControllerProvider,
  setControllerProviderFactory,
  detectControllerExtension,
  discoverControllers,
  resetControllerProvider,
} from './controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerProvider,
  type DiscoveredController,
} from './ControllerProvider'

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

  it('discoverControllers delegates to the ambient detector provider (#206)', async () => {
    const found: DiscoveredController[] = [{ id: 'x', address: '10.0.0.5', name: 'PB' }]
    // The detector is minted from the factory with the sentinel '__detect__' ip —
    // not tied to any one Controller, exactly like detectControllerExtension.
    const ips: string[] = []
    const fake = {
      ...new NullControllerProvider(),
      discover: () => Promise.resolve(found),
    } as unknown as ControllerProvider
    setControllerProviderFactory((ip) => {
      ips.push(ip)
      return fake
    })
    await expect(discoverControllers()).resolves.toEqual(found)
    expect(ips).toEqual(['__detect__'])
  })

  it('discoverControllers reuses the same ambient provider as detect', async () => {
    let mints = 0
    setControllerProviderFactory(() => {
      mints++
      return new NullControllerProvider()
    })
    await detectControllerExtension()
    await discoverControllers()
    expect(mints).toBe(1)
  })
})
