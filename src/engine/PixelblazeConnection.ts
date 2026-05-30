// Framework-free, transport-agnostic connection to a Pixelblaze controller's
// documented WebSocket JSON API. Zero React imports — consistent with the
// engine/UI boundary and the injectable-shim pattern (see builtins.ts/shim.ts).
//
// The module is *isomorphic*: it never references a global `WebSocket`. Instead
// the host injects a factory — the browser passes native `WebSocket`, Node
// passes `ws` — so the same protocol code serves the Node divergence harness
// today and a local bridge later. See docs/prd/Feature - Hardware Connectivity.md.
//
// Phase 1 covered the documented JSON text-frame API only: getVars / setVars /
// ping keepalive / connection lifecycle. Phase 2 (the capability-exploration
// spike, issue #108) adds the binary-frame protocol: listPrograms decode,
// getControls / setControls / brightness / activeProgramId round-trips, and the
// undocumented chunked pattern-push attempt (putSourceCode). See
// test/capability-spike for the live spike that exercises these against a real
// device and the resulting capability report.

import LZString from 'lz-string'

/** The slice of the WebSocket API this module needs — satisfied by both the
 *  browser's native `WebSocket` and the Node `ws` package. We use the `on*`
 *  property handlers (not addEventListener) because both implementations
 *  support them and `ev.data` carries the frame payload in each.
 *
 *  `send` accepts strings (JSON frames) and binary (`Uint8Array`) — the binary
 *  protocol below uses the latter. Both implementations accept a `Uint8Array`. */
export interface WebSocketLike {
  send(data: string | Uint8Array): void
  close(): void
  readyState: number
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

/** Binary message types, byte[0] of every binary frame. Values are the
 *  reverse-engineered constants the ElectroMage editor and pixelblaze-client
 *  use; only a subset is exercised here. */
export const MessageType = {
  putSourceCode: 1,
  putByteCode: 3,
  previewImage: 4,
  previewFrame: 5,
  getSourceCode: 6,
  getProgramList: 7,
  putPixelMap: 8,
  expanderConfig: 9,
} as const
export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType]

/** Frame flags, byte[1] of every binary frame. A payload too large for one
 *  frame is split into First → Middle(s) → Last; a payload that fits in one
 *  frame is sent as First|Last. */
export const FrameFlag = {
  none: 0,
  first: 1,
  middle: 2,
  last: 4,
} as const

/** Chunk size for the source/bytecode frames (the editor uses 1280-byte
 *  bodies). The 2-byte header is *not* counted against this. */
const FRAME_BODY_MAX = 1280

/** One entry of the decoded program list. */
export interface ProgramListEntry {
  id: string
  name: string
}

// ── pure binary-framing helpers (no socket, no class state) ───────────────────

/** Split a payload into chunked binary frames for `type`. Each frame is
 *  `[type, flags, ...body]` with body ≤ FRAME_BODY_MAX. A single-frame payload
 *  carries `first|last`; otherwise the run is first, middle…, last. An empty
 *  payload still produces one (empty) `first|last` frame. */
export function encodeBinaryFrames(
  type: MessageTypeValue,
  payload: Uint8Array,
  bodyMax: number = FRAME_BODY_MAX,
): Uint8Array[] {
  const frames: Uint8Array[] = []
  const total = Math.max(1, Math.ceil(payload.length / bodyMax))
  for (let i = 0; i < total; i++) {
    const body = payload.subarray(i * bodyMax, (i + 1) * bodyMax)
    let flags = 0
    if (i === 0) flags |= FrameFlag.first
    if (i > 0 && i < total - 1) flags |= FrameFlag.middle
    if (i === total - 1) flags |= FrameFlag.last
    const frame = new Uint8Array(2 + body.length)
    frame[0] = type
    frame[1] = flags
    frame.set(body, 2)
    frames.push(frame)
  }
  return frames
}

/** Normalise any binary frame payload the host might hand us (Node `Buffer`,
 *  browser `ArrayBuffer`, or a `Uint8Array`/typed-array view) to a Uint8Array.
 *  Returns null for non-binary input (strings, etc.). */
export function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data // covers Node Buffer too
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  }
  return null
}

/** Decode the reassembled getProgramList (type 7) payload. The body is UTF-8
 *  text, newline-separated, each line `id\tname`. Blank lines are skipped. */
export function decodeProgramList(payload: Uint8Array): ProgramListEntry[] {
  const text = new TextDecoder().decode(payload)
  const entries: ProgramListEntry[] = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    entries.push({ id: line.slice(0, tab), name: line.slice(tab + 1).trim() })
  }
  return entries
}

/** Builds a socket for a `ws://host:port` URL. The browser would pass
 *  `(url) => new WebSocket(url)`; Node `(url) => new WebSocket(url)` from `ws`. */
export type WebSocketFactory = (url: string) => WebSocketLike

export type ConnectionEvent = 'open' | 'close' | 'error'
type EventListener = (detail?: unknown) => void

export interface PixelblazeConnectionOptions {
  host: string
  /** Defaults to 81 — the only port a Pixelblaze speaks ws:// on. */
  port?: number
  webSocketFactory: WebSocketFactory
  /** Keepalive interval in ms. 0 (or undefined) disables automatic pinging. */
  pingIntervalMs?: number
  /** How long a correlated request waits for its reply before rejecting. */
  requestTimeoutMs?: number
  /** Injectable timers so tests need no fake clock; default to globals. */
  setInterval?: (fn: () => void, ms: number) => unknown
  clearInterval?: (handle: unknown) => void
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
}

// readyState values, per the WebSocket spec (shared by browser and `ws`).
const OPEN = 1

/** A request awaiting a reply, keyed by the response field that fulfils it
 *  (e.g. `getVars` waits for `vars`, `ping` waits for `ack`). Pixelblaze has no
 *  request IDs, so correlation is by response type, FIFO within each type. */
interface Pending {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: unknown
}

export class PixelblazeConnection {
  private readonly opts: Required<
    Pick<PixelblazeConnectionOptions, 'pingIntervalMs' | 'requestTimeoutMs'>
  > &
    PixelblazeConnectionOptions
  private readonly url: string
  private ws: WebSocketLike | null = null
  private pingHandle: unknown = null
  private readonly pending = new Map<string, Pending[]>()
  private readonly listeners = new Map<ConnectionEvent, Set<EventListener>>()
  // In-flight binary reassembly buffers, keyed by message type. A device may
  // interleave types, so each accumulates independently until its `last` frame.
  private readonly binaryBuffers = new Map<number, number[]>()
  // Timers resolved once so the rest of the class treats handles as opaque.
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown
  private readonly _clearTimeout: (h: unknown) => void
  private readonly _setInterval: (fn: () => void, ms: number) => unknown
  private readonly _clearInterval: (h: unknown) => void

  constructor(options: PixelblazeConnectionOptions) {
    this.opts = {
      port: 81,
      pingIntervalMs: 0,
      requestTimeoutMs: 5000,
      ...options,
    }
    this.url = `ws://${this.opts.host}:${this.opts.port ?? 81}`
    this._setTimeout =
      options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this._clearTimeout =
      options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    this._setInterval =
      options.setInterval ?? ((fn, ms) => setInterval(fn, ms))
    this._clearInterval =
      options.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>))
  }

  /** True once the socket handshake is open and frames can flow. */
  get isConnected(): boolean {
    return this.ws != null && this.ws.readyState === OPEN
  }

  /** Subscribe to lifecycle events. Returns an unsubscribe function. */
  on(event: ConnectionEvent, listener: EventListener): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => set!.delete(listener)
  }

  private emit(event: ConnectionEvent, detail?: unknown): void {
    this.listeners.get(event)?.forEach((l) => l(detail))
  }

  /** Open the connection. Resolves on the WebSocket `open` event, rejects on a
   *  pre-open error. Starts the ping keepalive (if configured) on open. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = this.opts.webSocketFactory(this.url)
      this.ws = ws
      let opened = false

      ws.onopen = () => {
        opened = true
        this.startPing()
        this.emit('open')
        resolve()
      }
      ws.onmessage = (ev) => this.handleMessage(ev.data)
      ws.onerror = (ev) => {
        this.emit('error', ev)
        if (!opened) reject(new Error('WebSocket error before open'))
      }
      ws.onclose = (ev) => this.handleClose(ev)
    })
  }

  /** Read live exported variables. Sends `{getVars:true}`, resolves with the
   *  parsed `vars` object from the `{vars:…}` reply. */
  getVars(): Promise<Record<string, number>> {
    return this.request('vars', { getVars: true }) as Promise<
      Record<string, number>
    >
  }

  /** Write exported variables. The firmware sends no reply, so this is
   *  fire-and-forget. Sends `{setVars:{…}}`. */
  setVars(vars: Record<string, number>): void {
    this.sendJson({ setVars: vars })
  }

  /** Keepalive ping. Sends `{ping:true}`, resolves on the `{ack:…}` reply. */
  ping(): Promise<void> {
    return this.request('ack', { ping: true }).then(() => undefined)
  }

  // ── Phase 2: binary + extended JSON protocol (capability spike, #108) ────────

  /** List the patterns stored on the device. Sends `{listPrograms:true}`; the
   *  reply is one or more binary (type-7) frames whose reassembled body is
   *  newline-separated `id\tname` text. Resolves with the decoded entries. */
  listPrograms(): Promise<ProgramListEntry[]> {
    return this.request('__programList', { listPrograms: true }).then(
      (payload) => decodeProgramList(payload as Uint8Array),
    )
  }

  /** Read device config. Sends `{getConfig:true}`; the firmware replies with
   *  *two* JSON packets — a settings packet carrying top-level `brightness`, and
   *  a sequencer packet carrying `activeProgram` (its `activeProgramId` and the
   *  *live* `controls` of the running program). We await both and merge the
   *  fields callers care about.
   *
   *  Note the asymmetry vs `getControls`: `activeControls` here are the *live*
   *  values (reflect a no-save `setControls`), whereas `getControls(id)` returns
   *  the *stored* (flash) controls. */
  getConfig(): Promise<{
    brightness?: number
    activeProgramId?: string
    activeControls?: Record<string, number>
  }> {
    if (!this.isConnected) {
      return Promise.reject(new Error('Cannot send: Pixelblaze connection is not open'))
    }
    const brightnessP = this.enqueue('brightness')
    const activeProgramP = this.enqueue('activeProgram')
    this.sendJson({ getConfig: true })
    return Promise.all([brightnessP, activeProgramP]).then(([b, ap]) => {
      const active = (ap ?? {}) as {
        activeProgramId?: string
        controls?: Record<string, number>
      }
      return {
        brightness: typeof b === 'number' ? b : undefined,
        activeProgramId: active.activeProgramId,
        activeControls: active.controls,
      }
    })
  }

  /** Read the UI controls for a program. Sends `{getControls:<id>}`, resolves
   *  with the raw reply object (key `controls`). Pass a specific program id —
   *  the firmware returns that program's *stored* controls, nested under the id:
   *  `{ controls: { "<id>": { sliderName: value, … } } }`. */
  getControls(programId = ''): Promise<Record<string, unknown>> {
    return this.request('controls', {
      getControls: programId,
    }) as Promise<Record<string, unknown>>
  }

  /** Set UI control values. Fire-and-forget (no reply). With `save:true` the
   *  device persists them to flash — a wear cost the spike documents. */
  setControls(controls: Record<string, number>, save = false): void {
    this.sendJson({ setControls: controls, save })
  }

  /** Set the active pattern by id. Fire-and-forget; `{activeProgramId:<id>}`. */
  setActiveProgram(id: string): void {
    this.sendJson({ activeProgramId: id })
  }

  /** Set global brightness (0..1). Fire-and-forget; with `save:true` it
   *  persists to flash (wear cost). Sends `{brightness, save}`. */
  setBrightness(value: number, save = false): void {
    this.sendJson({ brightness: value, save })
  }

  /** UNDOCUMENTED, EXPERIMENTAL — the headline unknown for #108. Attempts to
   *  push pattern *source* via the chunked binary protocol: LZString-compress
   *  the source to a Uint8Array, then send it as type-1 (putSourceCode) frames.
   *
   *  This pushes source only. The device runs *bytecode* (compiled by the
   *  ElectroMage editor in-browser and sent via setCode/putByteCode), which the
   *  IDE does not produce — so this alone is not expected to make a pattern run.
   *  The spike uses it to observe exactly what the device does with source-only
   *  push. Fire-and-forget at the protocol level. */
  putSourceCode(source: string): void {
    const compressed = LZString.compressToUint8Array(source)
    for (const frame of encodeBinaryFrames(MessageType.putSourceCode, compressed)) {
      this.sendBinary(frame)
    }
  }

  /** Close the socket and reject any in-flight requests. */
  close(): void {
    this.stopPing()
    this.ws?.close()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Queue a pending promise keyed by the response field that will fulfil it,
   *  without sending anything. Used both by `request` (one frame → one reply)
   *  and by `getConfig` (one frame → two replies on different keys). */
  private enqueue(responseKey: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = this._setTimeout(() => {
        this.dequeue(responseKey)
        reject(new Error(`Pixelblaze request timed out waiting for "${responseKey}"`))
      }, this.opts.requestTimeoutMs)

      const queue = this.pending.get(responseKey) ?? []
      queue.push({ resolve, reject, timeout })
      this.pending.set(responseKey, queue)
    })
  }

  /** Send a frame and queue a pending promise keyed by its expected reply field. */
  private request(responseKey: string, frame: object): Promise<unknown> {
    const promise = this.enqueue(responseKey)
    try {
      this.sendJson(frame)
    } catch (err) {
      const entry = this.dequeue(responseKey)
      if (entry) {
        this._clearTimeout(entry.timeout)
        entry.reject(err as Error)
      }
    }
    return promise
  }

  private dequeue(responseKey: string): Pending | undefined {
    const queue = this.pending.get(responseKey)
    if (!queue || queue.length === 0) return undefined
    const entry = queue.shift()
    if (queue.length === 0) this.pending.delete(responseKey)
    return entry
  }

  private sendJson(frame: object): void {
    if (!this.ws || this.ws.readyState !== OPEN) {
      throw new Error('Cannot send: Pixelblaze connection is not open')
    }
    this.ws.send(JSON.stringify(frame))
  }

  private sendBinary(frame: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== OPEN) {
      throw new Error('Cannot send: Pixelblaze connection is not open')
    }
    this.ws.send(frame)
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      const bytes = toUint8Array(data)
      if (bytes) this.handleBinary(bytes)
      return
    }
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data)
    } catch {
      return // ignore malformed frames rather than crash the connection
    }
    // Resolve the first matching pending request by response field.
    if ('vars' in msg) this.fulfil('vars', msg.vars)
    if ('ack' in msg) this.fulfil('ack', msg.ack)
    // getControls reply carries a `controls` object; we resolve with the whole msg.
    if ('controls' in msg) this.fulfil('controls', msg)
    // getConfig replies as two packets: settings (top-level `brightness`) and
    // sequencer (`activeProgram.activeProgramId`). Route each by its own key.
    if ('brightness' in msg) this.fulfil('brightness', msg.brightness)
    if ('activeProgram' in msg) this.fulfil('activeProgram', msg.activeProgram)
  }

  /** Reassemble a binary frame into its message type's buffer, completing the
   *  blob on the `last` flag and routing it to the matching pending request. */
  private handleBinary(frame: Uint8Array): void {
    if (frame.length < 2) return
    const type = frame[0]
    const flags = frame[1]
    const body = frame.subarray(2)

    let buf = this.binaryBuffers.get(type)
    if (flags & FrameFlag.first || !buf) {
      buf = []
      this.binaryBuffers.set(type, buf)
    }
    for (let i = 0; i < body.length; i++) buf.push(body[i])

    if (flags & FrameFlag.last) {
      this.binaryBuffers.delete(type)
      const complete = Uint8Array.from(buf)
      if (type === MessageType.getProgramList) {
        this.fulfil('__programList', complete)
      }
    }
  }

  private fulfil(responseKey: string, value: unknown): void {
    const entry = this.dequeue(responseKey)
    if (!entry) return
    this._clearTimeout(entry.timeout)
    entry.resolve(value)
  }

  private startPing(): void {
    if (!this.opts.pingIntervalMs) return
    this.pingHandle = this._setInterval(() => {
      // Swallow keepalive failures — the lifecycle close/error path reports them.
      this.ping().catch(() => undefined)
    }, this.opts.pingIntervalMs)
  }

  private stopPing(): void {
    if (this.pingHandle != null) {
      this._clearInterval(this.pingHandle)
      this.pingHandle = null
    }
  }

  private handleClose(detail?: unknown): void {
    this.stopPing()
    // Reject everything still waiting — the reply can never arrive now.
    for (const queue of this.pending.values()) {
      for (const entry of queue) {
        this._clearTimeout(entry.timeout)
        entry.reject(new Error('Pixelblaze connection closed'))
      }
    }
    this.pending.clear()
    this.emit('close', detail)
  }
}
