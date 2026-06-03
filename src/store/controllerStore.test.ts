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
  type ControllerCapabilities,
  type ProgramListEntry,
} from '@/engine/ControllerProvider'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { getControllerBindings, setControllerBindings } from '@/engine/storage'

// A fake per-Controller provider with a real (if minimal) status machine, so we
// can assert the keyed store's orchestration end-to-end. detectHelper acks true
// so the global extension probe reports present.
class FakeProvider extends NullControllerProvider {
  status: ControllerStatus = { kind: 'extension-present' }
  subs = new Set<(s: ControllerStatus) => void>()
  shouldFailConnect = false
  name: string | undefined = 'pixel-1'
  pixelCount: number | undefined = undefined
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
    return Promise.resolve({ name: this.name, pixelCount: this.pixelCount })
  }
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(this.pixelMap)
  }

  // ── push surface (#202) ─────────────────────────────────────────────────────
  readonly capabilities: ControllerCapabilities = { push: true, compile: true }
  /** A header-reconciling 16-byte blob (opcode 8, export 0): 8 + 8 + 0 === 16. */
  compileResult: Uint8Array = makeReconcilingBytecode()
  compileError: Error | null = null
  programs: ProgramListEntry[] = []
  pushed: { bytecode: Uint8Array; opts: { id: string; name?: string } }[] = []

  compile(_source: string): Promise<Uint8Array> {
    if (this.compileError) return Promise.reject(this.compileError)
    return Promise.resolve(this.compileResult)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  pushBytecode(bytecode: Uint8Array, opts: { id: string; name?: string }): Promise<void> {
    this.pushed.push({ bytecode, opts })
    return Promise.resolve()
  }
}

function makeReconcilingBytecode(): Uint8Array {
  const bytes = new Uint8Array(16)
  new DataView(bytes.buffer).setUint32(0, 8, true) // opcodeBytes = 8 → 8 + 8 + 0 = 16
  return bytes
}

const created = new Map<string, FakeProvider>()

beforeEach(async () => {
  localStorage.clear()
  __resetControllerProviders()
  useControllerStore.setState(controllerInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  await setControllerBindings({})
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

  describe('pushActivePattern (#202)', () => {
    const PATTERN_SRC = 'export function render(index) {\n  hsv(index, 1, 1)\n}\n'

    it('compiles + pushes the active pattern and records a created binding', async () => {
      await store().addController('10.0.0.5')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC, previewPatternName: 'Twinkle' })

      await store().pushActivePattern()

      const provider = created.get('10.0.0.5')!
      expect(provider.pushed).toHaveLength(1)
      expect(provider.pushed[0].opts.name).toBe('Twinkle')
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: true, created: true })
      // The pushed source is remembered (dirty gate) so a re-push is a no-op.
      expect(store().lastPushedSource['10.0.0.5']['pat-1']).toBe(PATTERN_SRC)
      // The freshly-minted binding is persisted for overwrite-in-place next time.
      const bindings = await getControllerBindings()
      expect(bindings['10.0.0.5']['pat-1']).toBe(provider.pushed[0].opts.id)
    })

    it('is a no-op when no pattern is active', async () => {
      await store().addController('10.0.0.5')
      useEditorStore.setState({ previewSource: PATTERN_SRC })
      // activePatternId stays null.

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toBeNull()
    })

    it('surfaces a compile failure as an error result without pushing', async () => {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.compileError = new Error('compiler offline')
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({ previewSource: PATTERN_SRC })

      await store().pushActivePattern()

      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
      expect(store().pushing).toBe(false)
      expect(store().pushResult).toEqual({ ok: false, message: 'compiler offline' })
    })
  })

  describe('requestPush preflight (#203)', () => {
    const PATTERN_SRC = 'export function render(index) {\n  hsv(index, 1, 1)\n}\n'

    async function arm(devicePixelCount: number | undefined, localPixelCount: number) {
      await store().addController('10.0.0.5')
      created.get('10.0.0.5')!.pixelCount = devicePixelCount
      usePatternStore.setState({ activePatternId: 'pat-1' })
      useEditorStore.setState({
        previewSource: PATTERN_SRC,
        previewPatternName: 'Twinkle',
        previewPixelCount: localPixelCount,
      })
    }

    it('pushes straight through when the counts match (no dialog)', async () => {
      await arm(256, 256)
      await store().requestPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
    })

    it('opens the dialog and defers the push on a count mismatch', async () => {
      await arm(256, 100)
      await store().requestPush()
      expect(store().preflight?.map((w) => w.kind)).toEqual(['fewer-than-device'])
      // The push has NOT happened yet — it waits on confirmPush.
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
    })

    it('confirmPush clears the dialog and completes the push', async () => {
      await arm(256, 400)
      await store().requestPush()
      expect(store().preflight).not.toBeNull()

      await store().confirmPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
      expect(store().pushResult).toEqual({ ok: true, created: true })
    })

    it('cancelPush dismisses the dialog without pushing', async () => {
      await arm(256, 100)
      await store().requestPush()
      store().cancelPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(0)
    })

    it('pushes through when the device count is unknown', async () => {
      await arm(undefined, 100)
      await store().requestPush()
      expect(store().preflight).toBeNull()
      expect(created.get('10.0.0.5')!.pushed).toHaveLength(1)
    })
  })
})
