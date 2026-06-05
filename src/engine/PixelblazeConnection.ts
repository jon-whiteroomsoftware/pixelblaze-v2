// Framework-free, transport-agnostic connection to a Pixelblaze controller's
// documented WebSocket JSON API. Zero React imports — consistent with the
// engine/UI boundary and the injectable-shim pattern (see builtins.ts/shim.ts).
//
// The module is *isomorphic*: it never references a global `WebSocket`. Instead
// the host injects a factory — the browser passes native `WebSocket`, Node
// passes `ws` — so the same protocol code serves the Node divergence harness and
// the browser extension relay unchanged. See docs/PXLBLZ Technical Reference.md §13
// and ADR-0014.
//
// Phase 1 covered the documented JSON text-frame API only: getVars / setVars /
// ping keepalive / connection lifecycle. Phase 2 (the capability-exploration
// spike, issue #108) adds the binary-frame protocol: listPrograms decode,
// getControls / setControls / brightness / activeProgramId round-trips, and the
// undocumented chunked pattern-push attempt (putSourceCode). See
// test/capability-spike for the live spike that exercises these against a real
// device and the resulting capability report.

import LZString from 'lz-string'
import { crc32 } from './bytecodePush'

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
 *  use; only a subset is exercised here. Reference: zranger1/pixelblaze-client
 *  `pixelblaze.py` `messageTypes` (commit 9be8470):
 *  https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L460 */
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

export type ConnectionEvent = 'open' | 'close' | 'error' | 'stale'
type EventListener = (detail?: unknown) => void

export interface PixelblazeConnectionOptions {
  host: string
  /** Defaults to 81 — the only port a Pixelblaze speaks ws:// on. */
  port?: number
  webSocketFactory: WebSocketFactory
  /** Keepalive interval in ms. 0 (or undefined) disables automatic pinging. */
  pingIntervalMs?: number
  /** Liveness watchdog window in ms. 0 (or undefined) disables it. When >0 the
   *  connection emits `'stale'` if no inbound frame — reply, ping `ack`, or the
   *  device's unsolicited `fps` stream — has arrived within this window. A live
   *  Pixelblaze streams `fps` continuously, so inbound silence means it is gone
   *  even when the socket never fires `close` (silent power-off, evicted MV3
   *  service worker). Requires `pingIntervalMs` > 0 to be evaluated (the watchdog
   *  rides the ping tick); should be a small multiple of it. */
  livenessTimeoutMs?: number
  /** Injectable monotonic-ish clock for the watchdog; defaults to `Date.now`. */
  now?: () => number
  /** How long a correlated request waits for its reply before rejecting. */
  requestTimeoutMs?: number
  /** How long `connect()` waits for the socket `open` event before rejecting and
   *  closing the half-open socket. 0 (or undefined) disables the timeout — open
   *  is then awaited indefinitely. A browser/relay socket pointed at an
   *  unreachable host can hang at the TCP layer for tens of seconds before it
   *  errors; a bounded timeout lets a reconnect loop poll at a steady cadence
   *  instead of stalling on one hung attempt, and tears down the dead socket so
   *  it does not leak into the device's small WS pool. */
  connectTimeoutMs?: number
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
    Pick<
      PixelblazeConnectionOptions,
      'pingIntervalMs' | 'requestTimeoutMs' | 'livenessTimeoutMs' | 'connectTimeoutMs'
    >
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
  private readonly _now: () => number
  // Wall-clock of the last inbound frame of any kind; the watchdog's heartbeat.
  private lastInboundAt = 0
  // Latched so the watchdog emits `'stale'` exactly once per connection.
  private staleEmitted = false

  constructor(options: PixelblazeConnectionOptions) {
    this.opts = {
      port: 81,
      pingIntervalMs: 0,
      requestTimeoutMs: 5000,
      livenessTimeoutMs: 0,
      connectTimeoutMs: 0,
      ...options,
    }
    this._now = options.now ?? (() => Date.now())
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

  // Last frame rate the device reported. Pixelblaze emits `fps` in its periodic
  // JSON status frames while connected; we passively capture the most recent
  // value rather than issuing a request (there is no `getFps` command). Null
  // until the device has reported one.
  private _lastFps: number | null = null

  // The device's configured name, captured passively from the top-level `name`
  // field of the settings packet (the same packet getConfig's brightness rides
  // in). Null until a settings frame reports one. Drives the Controller nickname.
  private _deviceName: string | null = null

  // The device's configured pixel count, captured passively from the top-level
  // `pixelCount` field of the settings packet (the same packet that carries
  // `name` and brightness). Null until a settings frame reports one. Fixed to the
  // device's wiring — the panel shows it read-only.
  private _pixelCount: number | null = null

  /** True once the socket handshake is open and frames can flow. */
  get isConnected(): boolean {
    return this.ws != null && this.ws.readyState === OPEN
  }

  /** The most recently reported frame rate, or null if none seen yet. */
  get fps(): number | null {
    return this._lastFps
  }

  /** The device's configured name, or null if it hasn't reported one. */
  get deviceName(): string | null {
    return this._deviceName
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
      // Latches once the open race is decided (open, pre-open error, or timeout),
      // so a later event can't double-settle the promise or start a keepalive on a
      // socket we've already abandoned.
      let settled = false

      // Bound the wait for `open`: a socket pointed at an unreachable host can hang
      // at the TCP layer for tens of seconds, which would stall a reconnect loop
      // that only advances when each attempt settles. On timeout, reject and close
      // the dead socket so the relay tears down its real socket.
      const timer =
        this.opts.connectTimeoutMs > 0
          ? this._setTimeout(() => {
              if (settled) return
              settled = true
              ws.close()
              reject(new Error('WebSocket open timed out'))
            }, this.opts.connectTimeoutMs)
          : null

      ws.onopen = () => {
        if (settled) return
        settled = true
        if (timer != null) this._clearTimeout(timer)
        this.lastInboundAt = this._now()
        this.staleEmitted = false
        this.startPing()
        this.emit('open')
        resolve()
      }
      ws.onmessage = (ev) => this.handleMessage(ev.data)
      ws.onerror = (ev) => {
        // Emit to subscribers UNCONDITIONALLY — deliberately outside the `settled`
        // latch. The latch guards only the one-shot connect() promise (resolve/
        // reject exactly once); the `error` event is a separate, repeatable signal
        // that must fire for errors during a live connection too, after open has
        // already settled the promise. (See lifecycle test: open → error → close.)
        this.emit('error', ev)
        // Past this point we only touch the promise, so a settled connection stops.
        if (settled) return
        settled = true
        if (timer != null) this._clearTimeout(timer)
        reject(new Error('WebSocket error before open'))
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
    name?: string
    pixelCount?: number
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
        name: this._deviceName ?? undefined,
        pixelCount: this._pixelCount ?? undefined,
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

  /** Set the device's configured pixel count. Fire-and-forget; sends
   *  `{pixelCount, save}` — `save:true` persists to flash so it survives a reboot
   *  (the reference client's `setPixelCount(n, save=True)`,
   *  https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2083).
   *  This is real wiring config, not a volatile control, so it defaults to save. */
  setPixelCount(value: number, save = true): void {
    this.sendJson({ pixelCount: value, save })
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

  /** Save a pattern to flash as a persisted record (#236), so it appears in the
   *  ElectroMage Saved Patterns list and its id resolves to a name — distinct from
   *  `pushByteCode`, which loads + runs a pattern but persists nothing. The blob is
   *  the encoded PBP (see `encodePbp` in pbpEncode.ts); the firmware's `putSourceCode`
   *  (type 1) payload is the 17-char program id (UTF-8) followed by the blob, mirroring
   *  the reference client's `PBP.toPixelblaze`:
   *  https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L3126
   *
   *  Fire-and-forget at the protocol level: resolves once every frame is sent. */
  saveProgram(id: string, pbpBlob: Uint8Array): void {
    const idBytes = new TextEncoder().encode(id)
    const payload = new Uint8Array(idBytes.length + pbpBlob.length)
    payload.set(idBytes, 0)
    payload.set(pbpBlob, idBytes.length)
    for (const frame of encodeBinaryFrames(MessageType.putSourceCode, payload)) {
      this.sendBinary(frame)
    }
  }

  /** Push compiled bytecode to the device as the save-and-run sequence (H10,
   *  issue #202): `{pause:true, setCode:{size,crc,name,id}}`, then the bytecode as
   *  chunked `putByteCode` binary frames, then `{setControls:{}}` and
   *  `{pause:false}` to save + run. The frames cross a single ordered socket, so no
   *  inter-step delay or ack-wait is needed.
   *
   *  Overwrite-in-place is the caller's choice of `id`: reuse the program id last
   *  pushed for this pattern to replace it, mint a new one to create. Control
   *  values are deliberately NOT part of the payload (`setControls:{}` clears the
   *  push of any) — the IDE pushes the pattern only, never tuned values.
   *
   *  Fire-and-forget at the protocol level: resolves once every frame is sent, not
   *  when the device has applied them (the firmware acks `setCode` but not the
   *  rest). */
  pushByteCode(bytecode: Uint8Array, opts: { id: string; name?: string }): void {
    const crc = crc32(bytecode)
    this.sendJson({
      pause: true,
      setCode: { size: bytecode.length, crc, name: opts.name ?? '', id: opts.id },
    })
    for (const frame of encodeBinaryFrames(MessageType.putByteCode, bytecode)) {
      this.sendBinary(frame)
    }
    this.sendJson({ setControls: {} })
    this.sendJson({ pause: false })
  }

  /** Push a binary pixel-map blob to the device's single shared map slot (H12, issue
   *  #204): the `mapData` is sent as chunked `putPixelMap` (type-8) binary frames,
   *  then `{savePixelMap:true}` persists it to flash (the Mapper tab's "Save"). The
   *  blob is produced by `encodeMapData` (see mapPush.ts) — this method owns only the
   *  framing + persist, exactly as the reference client's `setMapData` does:
   *  zranger1/pixelblaze-client `pixelblaze.py` `setMapData` (commit 9be8470):
   *  https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L1683
   *
   *  Fire-and-forget at the protocol level: resolves once every frame is sent, not
   *  when the device has applied them. `save` defaults true (persist). */
  putPixelMap(mapData: Uint8Array, opts: { save?: boolean } = {}): void {
    for (const frame of encodeBinaryFrames(MessageType.putPixelMap, mapData)) {
      this.sendBinary(frame)
    }
    if (opts.save ?? true) this.sendJson({ savePixelMap: true })
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
    // Any inbound frame — JSON reply, ping ack, or the device's unsolicited fps
    // stream — proves the device is still talking. Refresh the watchdog clock.
    this.lastInboundAt = this._now()
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
    // Passively capture the reported frame rate from any status frame.
    if ('fps' in msg && typeof msg.fps === 'number') this._lastFps = msg.fps
    // Passively capture the device name from the settings packet's top-level
    // `name` (distinct from the sequencer packet's nested activeProgram.name).
    if ('name' in msg && typeof msg.name === 'string') this._deviceName = msg.name
    // Passively capture the device's pixel count from the settings packet.
    if ('pixelCount' in msg && typeof msg.pixelCount === 'number') this._pixelCount = msg.pixelCount
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
    this.lastInboundAt = this._now()
    this.pingHandle = this._setInterval(() => {
      // Before pinging again, check whether the device has gone silent. A live
      // Pixelblaze answers pings AND streams fps, so a quiet window past the
      // watchdog means it is gone even if the socket never closed.
      if (this.checkStale()) return
      // Swallow keepalive failures — the lifecycle close/error path reports them.
      this.ping().catch(() => undefined)
    }, this.opts.pingIntervalMs)
  }

  /** True if the liveness window has elapsed with no inbound frame. On the first
   *  such tick it latches, stops the keepalive, and emits `'stale'` so the owning
   *  provider can tear the dead socket down and reconnect. */
  private checkStale(): boolean {
    const timeout = this.opts.livenessTimeoutMs
    if (!timeout || this.staleEmitted) return false
    if (this._now() - this.lastInboundAt <= timeout) return false
    this.staleEmitted = true
    this.stopPing()
    this.emit('stale')
    return true
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
