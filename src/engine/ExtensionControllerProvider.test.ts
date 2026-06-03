// H3 (#195): the extension-backed provider, exercised end-to-end against a fake
// relay that emulates a Pixelblaze device. Because the provider drives a real
// PixelblazeConnection over a RelayWebSocket, these tests cover the whole stack
// below the seam — handshake, status machine, JSON round-trips, fire-and-forget
// writes, disconnect, and bounded reconnect — without a DOM or a real extension.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ExtensionControllerProvider } from './ExtensionControllerProvider'
import { RELAY_SOURCE, type RelayMessage, type RelayTransport } from './RelayWebSocket'
import type { ControllerStatus } from './ControllerProvider'

/** A fake relay that plays both the extension and a Pixelblaze device. Replies
 *  are delivered on a microtask so the page-side promise machinery runs first,
 *  mirroring the real async hop. */
function makeDeviceTransport(opts: { detectAck?: boolean; failConnect?: boolean } = {}) {
  const detectAck = opts.detectAck ?? true
  const listeners = new Set<(m: RelayMessage) => void>()
  const writes: Record<string, unknown>[] = []
  let lastConnId = ''
  let openSocket = false

  const emit = (m: RelayMessage) => queueMicrotask(() => listeners.forEach((l) => l(m)))
  const reply = (connId: string, obj: object) =>
    emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId, payload: { text: JSON.stringify(obj) } })

  const transport: RelayTransport = {
    post(msg) {
      switch (msg.type) {
        case 'detect':
          if (detectAck) emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' })
          return
        case 'connect':
          lastConnId = msg.connId
          if (opts.failConnect) {
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'refused' })
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
          } else {
            openSocket = true
            emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId })
          }
          return
        case 'close':
          openSocket = false
          return
        case 'send': {
          if (!('text' in msg.payload)) return
          const cmd = JSON.parse(msg.payload.text) as Record<string, unknown>
          if (cmd.getVars) reply(msg.connId, { vars: { speed: 0.5 } })
          if (cmd.getConfig) {
            reply(msg.connId, { brightness: 0.4 })
            reply(msg.connId, { activeProgram: { activeProgramId: 'P1', controls: { sliderX: 0.7 } } })
          }
          if (cmd.ping) reply(msg.connId, { ack: 1 })
          if ('brightness' in cmd) writes.push(cmd)
          if ('setControls' in cmd) writes.push(cmd)
          return
        }
      }
    },
    subscribe(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }

  return {
    transport,
    writes,
    isOpen: () => openSocket,
    pushFrame: (obj: object) => reply(lastConnId, obj),
    dropSocket: () => emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: lastConnId }),
  }
}

const TARGET = { address: '192.168.8.224' }

describe('ExtensionControllerProvider', () => {
  it('starts in no-helper', () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    expect(p.getStatus()).toEqual({ kind: 'no-extension' })
    expect(p.capabilities).toEqual({ push: false, compile: false })
  })

  it('detectHelper resolves true and moves to helper-present when the relay acks', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await expect(p.detectHelper()).resolves.toBe(true)
    expect(p.getStatus()).toEqual({ kind: 'extension-present' })
  })

  it('detectHelper resolves false and stays no-helper when there is no ack', async () => {
    const p = new ExtensionControllerProvider({
      transport: makeDeviceTransport({ detectAck: false }).transport,
      detectTimeoutMs: 10,
    })
    await expect(p.detectHelper()).resolves.toBe(false)
    expect(p.getStatus()).toEqual({ kind: 'no-extension' })
  })

  it('connects through the relay and reports connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    const seen: ControllerStatus[] = []
    p.subscribe((s) => seen.push(s))
    await p.connect(TARGET)
    expect(p.getStatus()).toEqual({ kind: 'connected', controller: { id: TARGET.address, address: TARGET.address } })
    expect(seen.map((s) => s.kind)).toContain('connecting')
  })

  it('rejects connect when no helper is installed', async () => {
    const p = new ExtensionControllerProvider({
      transport: makeDeviceTransport({ detectAck: false }).transport,
      detectTimeoutMs: 10,
    })
    await expect(p.connect(TARGET)).rejects.toThrow(/helper/i)
    expect(p.getStatus().kind).toBe('error')
  })

  it('goes to error when the socket fails to open', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport({ failConnect: true }).transport })
    await expect(p.connect(TARGET)).rejects.toThrow()
    expect(p.getStatus().kind).toBe('error')
  })

  it('reads vars and config across the bridge once connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await p.connect(TARGET)
    await expect(p.getVars()).resolves.toEqual({ speed: 0.5 })
    await expect(p.getConfig()).resolves.toEqual({
      brightness: 0.4,
      activeProgramId: 'P1',
      activeControls: { sliderX: 0.7 },
    })
  })

  it('reports captured fps via getTelemetry', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await expect(p.getTelemetry()).resolves.toEqual({ fps: null })
    d.pushFrame({ fps: 73 })
    await new Promise((r) => queueMicrotask(() => r(null)))
    await expect(p.getTelemetry()).resolves.toEqual({ fps: 73 })
  })

  it('sends brightness and controls writes to the device', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await p.setBrightness(0.25)
    await p.setControls({ sliderX: 0.9 }, true)
    expect(d.writes).toEqual([
      { brightness: 0.25, save: false },
      { setControls: { sliderX: 0.9 }, save: true },
    ])
  })

  it('resolves getPixelMap as null (H13 unconfirmed)', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await p.connect(TARGET)
    await expect(p.getPixelMap()).resolves.toBeNull()
  })

  it('rejects reads when not connected', async () => {
    const p = new ExtensionControllerProvider({ transport: makeDeviceTransport().transport })
    await expect(p.getVars()).rejects.toThrow(/not connected/i)
  })

  it('disconnect returns to helper-present and stops reconnecting', async () => {
    const d = makeDeviceTransport()
    const p = new ExtensionControllerProvider({ transport: d.transport })
    await p.connect(TARGET)
    await p.disconnect()
    expect(p.getStatus()).toEqual({ kind: 'extension-present' })
    expect(d.isOpen()).toBe(false)
  })

  describe('reconnect on unexpected drop', () => {
    let timers: Array<() => void>
    let opts: ConstructorParameters<typeof ExtensionControllerProvider>[0]

    beforeEach(() => {
      timers = []
    })
    afterEach(() => vi.restoreAllMocks())

    const flushTimers = () => {
      const pending = timers
      timers = []
      pending.forEach((fn) => fn())
    }

    it('attempts to reconnect and returns to connected', async () => {
      const d = makeDeviceTransport()
      opts = {
        transport: d.transport,
        reconnectDelayMs: 5,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      }
      const p = new ExtensionControllerProvider(opts)
      await p.connect(TARGET)
      expect(p.getStatus().kind).toBe('connected')

      d.dropSocket()
      await new Promise((r) => queueMicrotask(() => r(null)))
      expect(p.getStatus().kind).toBe('connecting')

      flushTimers() // fire the scheduled reconnect
      await new Promise((r) => setTimeout(r, 0))
      expect(p.getStatus().kind).toBe('connected')
    })

    it('goes to error after exhausting reconnect attempts', async () => {
      const d = makeDeviceTransport()
      const p = new ExtensionControllerProvider({
        transport: d.transport,
        maxReconnectAttempts: 0,
        setTimeout: ((fn: () => void) => {
          timers.push(fn)
          return 0
        }) as unknown as typeof setTimeout,
      })
      await p.connect(TARGET)
      d.dropSocket()
      await new Promise((r) => queueMicrotask(() => r(null)))
      expect(p.getStatus()).toEqual({ kind: 'error', message: 'Controller connection lost' })
    })
  })
})
