import {
  useControllerStore,
  controllerInitialState,
  __resetControllerProviders,
} from './controllerStore'
import {
  setControllerProviderFactory,
  resetControllerProvider,
  getControllerProvider,
} from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerStatus,
  type ControllerTarget,
  type ControllerConfig,
} from '@/engine/ControllerProvider'

// A fake per-Controller provider with a real (if minimal) status machine, so we
// can assert the keyed store's orchestration end-to-end. detectHelper acks true
// so the global extension probe reports present.
class FakeProvider extends NullControllerProvider {
  status: ControllerStatus = { kind: 'extension-present' }
  subs = new Set<(s: ControllerStatus) => void>()
  shouldFailConnect = false
  name: string | undefined = 'pixel-1'
  pixelMap: number[][] | null = [
    [0, 0],
    [1, 1],
  ]
  connects: ControllerTarget[] = []
  disconnects = 0

  detectHelper(): Promise<boolean> {
    return Promise.resolve(true)
  }
  getStatus(): ControllerStatus {
    return this.status
  }
  subscribe(listener: (s: ControllerStatus) => void): () => void {
    this.subs.add(listener)
    return () => this.subs.delete(listener)
  }
  private emit(status: ControllerStatus) {
    this.status = status
    this.subs.forEach((l) => l(status))
  }
  connect(target: ControllerTarget): Promise<void> {
    this.connects.push(target)
    this.emit({ kind: 'connecting', target })
    if (this.shouldFailConnect) {
      this.emit({ kind: 'error', message: 'unreachable' })
      return Promise.reject(new Error('unreachable'))
    }
    this.emit({ kind: 'connected', controller: { id: target.address, address: target.address, name: this.name } })
    return Promise.resolve()
  }
  disconnect(): Promise<void> {
    this.disconnects++
    this.emit({ kind: 'extension-present' })
    return Promise.resolve()
  }
  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve({ name: this.name })
  }
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(this.pixelMap)
  }
}

const created = new Map<string, FakeProvider>()

beforeEach(() => {
  localStorage.clear()
  __resetControllerProviders()
  useControllerStore.setState(controllerInitialState)
  created.clear()
  setControllerProviderFactory((ip) => {
    const p = new FakeProvider()
    created.set(ip, p)
    return p
  })
})

afterEach(() => {
  __resetControllerProviders()
  resetControllerProvider()
})

const store = () => useControllerStore.getState()

describe('controllerStore (keyed)', () => {
  it('detectExtension records global extension presence', async () => {
    await store().detectExtension()
    expect(store().extensionPresent).toBe(true)
  })

  it('addController connects, becomes the active live pill, reads nickname + mapDim', async () => {
    await store().addController('10.0.0.5')
    const entry = store().controllers['10.0.0.5']
    expect(entry.phase).toBe('live')
    expect(entry.nickname).toBe('pixel-1')
    expect(entry.mapDim).toBe(2)
    expect(store().activeIp).toBe('10.0.0.5')
    expect(created.get('10.0.0.5')!.connects).toEqual([{ address: '10.0.0.5' }])
  })

  it('a nameless device leaves the nickname unset (pill falls back to IP)', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.name = undefined
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.7')
    expect(store().controllers['10.0.0.7'].nickname).toBeUndefined()
  })

  it('points the registry active provider at the connected Controller', async () => {
    await store().addController('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('a failed connect leaves the pill in error and does not persist it', async () => {
    setControllerProviderFactory((ip) => {
      const p = new FakeProvider()
      p.shouldFailConnect = true
      created.set(ip, p)
      return p
    })
    await store().addController('10.0.0.9')
    expect(store().controllers['10.0.0.9'].phase).toBe('error')
    expect(store().lastConnectedIp).toBeNull()
  })

  it('persists only the last-connected IP', async () => {
    await store().addController('10.0.0.5')
    expect(store().lastConnectedIp).toBe('10.0.0.5')
    expect(localStorage.getItem('pixelblaze-controller')).toContain('10.0.0.5')
  })

  it('supports a second Controller: it becomes active, the first stays connected', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    expect(Object.keys(store().controllers)).toEqual(['10.0.0.5', '10.0.0.6'])
    expect(store().activeIp).toBe('10.0.0.6')
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
  })

  it('setActive re-points the registry provider', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    store().setActive('10.0.0.5')
    expect(store().activeIp).toBe('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('removeController drops the entry, disconnects, and re-points active', async () => {
    await store().addController('10.0.0.5')
    await store().addController('10.0.0.6')
    await store().removeController('10.0.0.6')
    expect(store().controllers['10.0.0.6']).toBeUndefined()
    expect(store().activeIp).toBe('10.0.0.5')
    expect(getControllerProvider()).toBe(created.get('10.0.0.5'))
  })

  it('removing the last-connected Controller clears the remembered IP', async () => {
    await store().addController('10.0.0.5')
    await store().removeController('10.0.0.5')
    expect(store().activeIp).toBeNull()
    expect(store().lastConnectedIp).toBeNull()
  })

  it('autoConnect reconnects only the remembered Controller', async () => {
    useControllerStore.setState({ lastConnectedIp: '10.0.0.5' })
    await store().autoConnect()
    expect(store().controllers['10.0.0.5'].phase).toBe('live')
    expect(store().activeIp).toBe('10.0.0.5')
  })

  it('autoConnect with nothing remembered does nothing', async () => {
    await store().autoConnect()
    expect(Object.keys(store().controllers)).toHaveLength(0)
  })
})
