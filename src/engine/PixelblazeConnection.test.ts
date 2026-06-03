import { describe, it, expect, vi } from 'vitest'
import LZString from 'lz-string'
import {
  PixelblazeConnection,
  MessageType,
  FrameFlag,
  encodeBinaryFrames,
  decodeProgramList,
  toUint8Array,
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
  sentBinary: Uint8Array[] = []
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null

  constructor(public url: string) {}

  send(data: string | Uint8Array): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('not open')
    if (typeof data === 'string') this.sent.push(data)
    else this.sentBinary.push(data)
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

  /** Deliver a raw binary frame (already framed) to the connection. */
  simulateBinary(frame: Uint8Array): void {
    this.onmessage?.({ data: frame })
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

  describe('liveness watchdog', () => {
    it('emits "stale" when no inbound frame arrives within livenessTimeoutMs', async () => {
      vi.useFakeTimers()
      try {
        const { conn, socket } = await connected({
          pingIntervalMs: 5000,
          livenessTimeoutMs: 12000,
        })
        const events: string[] = []
        conn.on('stale', () => events.push('stale'))

        // Device never answers the pings and never streams fps. The ping ticks at
        // 5s/10s are still inside the window; the 15s tick crosses it.
        vi.advanceTimersByTime(15000)
        expect(events).toEqual(['stale'])
        // Latched: a later tick must not re-emit, and pinging has stopped.
        const sentBefore = socket.sent.length
        vi.advanceTimersByTime(20000)
        expect(events).toEqual(['stale'])
        expect(socket.sent.length).toBe(sentBefore)
      } finally {
        vi.useRealTimers()
      }
    })

    it('stays alive while the device keeps streaming fps frames', async () => {
      vi.useFakeTimers()
      try {
        const { conn, socket } = await connected({
          pingIntervalMs: 5000,
          livenessTimeoutMs: 12000,
        })
        const events: string[] = []
        conn.on('stale', () => events.push('stale'))

        vi.advanceTimersByTime(10000)
        socket.simulateMessage({ fps: 60 }) // refreshes the watchdog clock
        vi.advanceTimersByTime(10000)
        expect(events).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('never emits "stale" when the watchdog is disabled (livenessTimeoutMs 0)', async () => {
      vi.useFakeTimers()
      try {
        const { conn } = await connected({ pingIntervalMs: 5000 })
        const events: string[] = []
        conn.on('stale', () => events.push('stale'))
        vi.advanceTimersByTime(60000)
        expect(events).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ── Phase 2: binary + extended JSON protocol (#108) ──────────────────────

  describe('binary framing (pure helpers)', () => {
    it('encodes a single short payload as one first|last frame', () => {
      const frames = encodeBinaryFrames(MessageType.putSourceCode, Uint8Array.of(1, 2, 3))
      expect(frames).toHaveLength(1)
      expect(frames[0][0]).toBe(MessageType.putSourceCode)
      expect(frames[0][1]).toBe(FrameFlag.first | FrameFlag.last)
      expect([...frames[0].subarray(2)]).toEqual([1, 2, 3])
    })

    it('encodes an empty payload as one empty first|last frame', () => {
      const frames = encodeBinaryFrames(MessageType.putSourceCode, new Uint8Array(0))
      expect(frames).toHaveLength(1)
      expect(frames[0][1]).toBe(FrameFlag.first | FrameFlag.last)
      expect(frames[0]).toHaveLength(2) // header only
    })

    it('chunks at the body boundary with first / middle / last flags', () => {
      // bodyMax=2, payload of 5 → frames of 2,2,1 → first, middle, last
      const frames = encodeBinaryFrames(MessageType.putByteCode, Uint8Array.of(1, 2, 3, 4, 5), 2)
      expect(frames.map((f) => f[1])).toEqual([
        FrameFlag.first,
        FrameFlag.middle,
        FrameFlag.last,
      ])
      const reassembled = frames.flatMap((f) => [...f.subarray(2)])
      expect(reassembled).toEqual([1, 2, 3, 4, 5])
    })

    it('decodes a program list payload into id/name entries', () => {
      const text = 'abc123\tRainbow Melt\nXYZ\tKITT\n\nnotab\n'
      const entries = decodeProgramList(new TextEncoder().encode(text))
      expect(entries).toEqual([
        { id: 'abc123', name: 'Rainbow Melt' },
        { id: 'XYZ', name: 'KITT' },
      ])
    })

    it('toUint8Array normalises ArrayBuffer / views and rejects strings', () => {
      const u = Uint8Array.of(9, 8, 7)
      expect(toUint8Array(u)).toBe(u)
      expect([...toUint8Array(u.buffer)!]).toEqual([9, 8, 7])
      expect(toUint8Array('nope')).toBeNull()
    })
  })

  describe('listPrograms', () => {
    it('sends {listPrograms:true} and decodes a single binary frame', async () => {
      const { conn, socket } = await connected()
      const promise = conn.listPrograms()
      expect(socket.lastFrame()).toEqual({ listPrograms: true })

      const body = new TextEncoder().encode('id1\tAlpha\nid2\tBeta')
      const [frame] = encodeBinaryFrames(MessageType.getProgramList, body)
      socket.simulateBinary(frame)

      await expect(promise).resolves.toEqual([
        { id: 'id1', name: 'Alpha' },
        { id: 'id2', name: 'Beta' },
      ])
    })

    it('reassembles a multi-frame program list', async () => {
      const { conn, socket } = await connected()
      const promise = conn.listPrograms()
      const body = new TextEncoder().encode('id1\tAlpha\nid2\tBeta\nid3\tGamma')
      // small bodyMax forces several frames
      for (const f of encodeBinaryFrames(MessageType.getProgramList, body, 8)) {
        socket.simulateBinary(f)
      }
      await expect(promise).resolves.toEqual([
        { id: 'id1', name: 'Alpha' },
        { id: 'id2', name: 'Beta' },
        { id: 'id3', name: 'Gamma' },
      ])
    })

    it('keeps interleaved message types separate during reassembly', async () => {
      const { conn, socket } = await connected()
      const promise = conn.listPrograms()
      const body = new TextEncoder().encode('id1\tAlpha')
      const [first, ...rest] = encodeBinaryFrames(MessageType.getProgramList, body, 4)
      // an unrelated type-5 (previewFrame) blob arrives mid-stream and must not
      // corrupt the program-list buffer
      socket.simulateBinary(first)
      socket.simulateBinary(Uint8Array.of(MessageType.previewFrame, FrameFlag.first | FrameFlag.last, 42))
      for (const f of rest) socket.simulateBinary(f)
      await expect(promise).resolves.toEqual([{ id: 'id1', name: 'Alpha' }])
    })
  })

  describe('controls / brightness / activeProgram', () => {
    it('getControls sends {getControls} and resolves with the reply object', async () => {
      const { conn, socket } = await connected()
      const promise = conn.getControls('pat1')
      expect(socket.lastFrame()).toEqual({ getControls: 'pat1' })
      socket.simulateMessage({ activeProgramId: 'pat1', controls: { sliderHue: 0.5 } })
      await expect(promise).resolves.toEqual({
        activeProgramId: 'pat1',
        controls: { sliderHue: 0.5 },
      })
    })

    it('setControls sends values and the save flag', async () => {
      const { conn, socket } = await connected()
      conn.setControls({ sliderHue: 0.25 }, true)
      expect(socket.lastFrame()).toEqual({ setControls: { sliderHue: 0.25 }, save: true })
    })

    it('getConfig sends {getConfig:true} and merges the two reply packets', async () => {
      const { conn, socket } = await connected()
      const promise = conn.getConfig()
      expect(socket.lastFrame()).toEqual({ getConfig: true })
      // settings packet (top-level brightness) and sequencer packet arrive separately
      socket.simulateMessage({ brightness: 0.4, pixelCount: 256, name: 'pb' })
      socket.simulateMessage({
        activeProgram: { activeProgramId: 'pat1', name: 'X', controls: { sliderA: 0.7 } },
      })
      await expect(promise).resolves.toEqual({
        brightness: 0.4,
        activeProgramId: 'pat1',
        activeControls: { sliderA: 0.7 },
        name: 'pb',
      })
    })

    it('getConfig leaves name undefined when the settings packet carries none', async () => {
      const { conn, socket } = await connected()
      const promise = conn.getConfig()
      socket.simulateMessage({ brightness: 0.5 })
      socket.simulateMessage({ activeProgram: { activeProgramId: 'pat1' } })
      await expect(promise).resolves.toEqual({
        brightness: 0.5,
        activeProgramId: 'pat1',
        activeControls: undefined,
        name: undefined,
      })
    })

    it('getConfig tolerates the two packets arriving in either order', async () => {
      const { conn, socket } = await connected()
      const promise = conn.getConfig()
      socket.simulateMessage({ activeProgram: { activeProgramId: 'pat2' } })
      socket.simulateMessage({ brightness: 0.9 })
      await expect(promise).resolves.toEqual({
        brightness: 0.9,
        activeProgramId: 'pat2',
        activeControls: undefined,
        name: undefined,
      })
    })

    it('setActiveProgram sends {activeProgramId}', async () => {
      const { conn, socket } = await connected()
      conn.setActiveProgram('pat9')
      expect(socket.lastFrame()).toEqual({ activeProgramId: 'pat9' })
    })

    it('setBrightness sends {brightness, save}', async () => {
      const { conn, socket } = await connected()
      conn.setBrightness(0.3)
      expect(socket.lastFrame()).toEqual({ brightness: 0.3, save: false })
    })
  })

  describe('putSourceCode (experimental push)', () => {
    it('emits LZString-compressed source as type-1 binary frames', async () => {
      const { conn, socket } = await connected()
      const source = 'export function render(i){ hsv(i/16,1,1) }'
      conn.putSourceCode(source)

      expect(socket.sentBinary.length).toBeGreaterThan(0)
      expect(socket.sentBinary[0][0]).toBe(MessageType.putSourceCode)
      // first frame carries the `first` flag, last carries `last`
      expect(socket.sentBinary[0][1] & FrameFlag.first).toBeTruthy()
      const lastFrame = socket.sentBinary[socket.sentBinary.length - 1]
      expect(lastFrame[1] & FrameFlag.last).toBeTruthy()

      // bodies concatenate back to the original compressed payload
      const body = socket.sentBinary.flatMap((f) => [...f.subarray(2)])
      expect(body).toEqual([...LZString.compressToUint8Array(source)])
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
