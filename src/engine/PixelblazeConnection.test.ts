import { describe, it, expect, vi } from 'vitest'
import {
  PixelblazeConnection,
  type WebSocketLike,
} from './PixelblazeConnection'

// A fake in-memory WebSocket — no network. It records sent frames and lets the
// test drive the lifecycle and simulate device replies. Satisfies WebSocketLike,
// the same shape the browser's WebSocket and Node's `ws` provide.
class FakeWebSocket implements WebSocketLike {
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = 0 // CONNECTING
  sent: string[] = []
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null

  constructor(public url: string) {}

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('not open')
    this.sent.push(data)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({})
  }

  // ── test drivers ──────────────────────────────────────────────────────────
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.({})
  }

  simulateMessage(obj: unknown): void {
    this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) })
  }

  simulateError(detail?: unknown): void {
    this.onerror?.(detail ?? {})
  }

  lastFrame(): unknown {
    return JSON.parse(this.sent[this.sent.length - 1])
  }
}

/** Wires a connection to a fresh FakeWebSocket and exposes both. */
function makeConnection(
  opts: Partial<ConstructorParameters<typeof PixelblazeConnection>[0]> = {},
) {
  let socket!: FakeWebSocket
  const conn = new PixelblazeConnection({
    host: '192.168.1.50',
    webSocketFactory: (url) => (socket = new FakeWebSocket(url)),
    ...opts,
  })
  return { conn, getSocket: () => socket }
}

/** Opens a connection and returns it ready to use. */
async function connected(
  opts?: Partial<ConstructorParameters<typeof PixelblazeConnection>[0]>,
) {
  const { conn, getSocket } = makeConnection(opts)
  const promise = conn.connect()
  getSocket().simulateOpen()
  await promise
  return { conn, socket: getSocket() }
}

describe('PixelblazeConnection', () => {
  it('connects to ws://<host>:81 via the injected factory', async () => {
    const { conn, socket } = await connected()
    expect(socket.url).toBe('ws://192.168.1.50:81')
    expect(conn.isConnected).toBe(true)
  })

  it('uses a custom port when provided', () => {
    const { conn, getSocket } = makeConnection({ port: 8081 })
    conn.connect()
    expect(getSocket().url).toBe('ws://192.168.1.50:8081')
  })

  it('connect() rejects on a pre-open error', async () => {
    const { conn, getSocket } = makeConnection()
    const promise = conn.connect()
    getSocket().simulateError()
    await expect(promise).rejects.toThrow(/before open/)
  })

  describe('getVars', () => {
    it('round-trips: sends {getVars:true} and resolves with the reply vars', async () => {
      const { conn, socket } = await connected()
      const promise = conn.getVars()
      expect(socket.lastFrame()).toEqual({ getVars: true })

      socket.simulateMessage({ vars: { energy: 0.5, hue: 0.25 } })
      await expect(promise).resolves.toEqual({ energy: 0.5, hue: 0.25 })
    })

    it('correlates concurrent requests FIFO', async () => {
      const { conn, socket } = await connected()
      const first = conn.getVars()
      const second = conn.getVars()

      socket.simulateMessage({ vars: { n: 1 } })
      socket.simulateMessage({ vars: { n: 2 } })

      await expect(first).resolves.toEqual({ n: 1 })
      await expect(second).resolves.toEqual({ n: 2 })
    })

    it('rejects when the reply does not arrive before the timeout', async () => {
      vi.useFakeTimers()
      try {
        const { conn, socket } = await connected({ requestTimeoutMs: 1000 })
        const promise = conn.getVars()
        const assertion = expect(promise).rejects.toThrow(/timed out/)
        vi.advanceTimersByTime(1000)
        await assertion
        // a late reply must not throw / double-resolve
        expect(() => socket.simulateMessage({ vars: {} })).not.toThrow()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('setVars', () => {
    it('sends a correctly-shaped {setVars:{…}} frame (fire-and-forget)', async () => {
      const { conn, socket } = await connected()
      conn.setVars({ energy: 0.8, speed: 0.1 })
      expect(socket.lastFrame()).toEqual({ setVars: { energy: 0.8, speed: 0.1 } })
    })

    it('throws when the connection is not open', () => {
      const { conn } = makeConnection()
      expect(() => conn.setVars({ x: 1 })).toThrow(/not open/)
    })
  })

  describe('ping', () => {
    it('sends {ping:true} and resolves on {ack}', async () => {
      const { conn, socket } = await connected()
      const promise = conn.ping()
      expect(socket.lastFrame()).toEqual({ ping: true })
      socket.simulateMessage({ ack: 1 })
      await expect(promise).resolves.toBeUndefined()
    })

    it('fires automatic keepalive pings on the configured interval', async () => {
      vi.useFakeTimers()
      try {
        const { socket } = await connected({ pingIntervalMs: 5000 })
        vi.advanceTimersByTime(5000)
        expect(socket.lastFrame()).toEqual({ ping: true })
        vi.advanceTimersByTime(5000)
        expect(socket.sent.filter((f) => f.includes('ping')).length).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('lifecycle', () => {
    it('emits open / error / close to subscribers', async () => {
      const events: string[] = []
      const { conn, getSocket } = makeConnection()
      conn.on('open', () => events.push('open'))
      conn.on('error', () => events.push('error'))
      conn.on('close', () => events.push('close'))

      const promise = conn.connect()
      getSocket().simulateOpen()
      await promise
      getSocket().simulateError()
      conn.close()

      expect(events).toEqual(['open', 'error', 'close'])
    })

    it('unsubscribes via the returned disposer', async () => {
      const { conn, getSocket } = makeConnection()
      const seen: string[] = []
      const off = conn.on('error', () => seen.push('error'))
      conn.connect()
      getSocket().simulateOpen()
      off()
      getSocket().simulateError()
      expect(seen).toEqual([])
    })

    it('rejects in-flight requests when the connection closes', async () => {
      const { conn } = await connected()
      const promise = conn.getVars()
      conn.close()
      await expect(promise).rejects.toThrow(/closed/)
    })

    it('reports isConnected=false after close', async () => {
      const { conn } = await connected()
      conn.close()
      expect(conn.isConnected).toBe(false)
    })

    it('stops keepalive pings after close', async () => {
      vi.useFakeTimers()
      try {
        const { conn, socket } = await connected({ pingIntervalMs: 5000 })
        conn.close()
        const before = socket.sent.length
        vi.advanceTimersByTime(15000)
        expect(socket.sent.length).toBe(before)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('ignores binary/non-string and malformed frames without crashing', async () => {
    const { conn, socket } = await connected()
    expect(() => socket.simulateMessage(new Uint8Array([7, 0, 0]))).not.toThrow()
    expect(() => socket.onmessage?.({ data: 'not json {' })).not.toThrow()
    // the connection still works afterwards
    const promise = conn.getVars()
    socket.simulateMessage({ vars: { ok: 1 } })
    await expect(promise).resolves.toEqual({ ok: 1 })
  })
})
