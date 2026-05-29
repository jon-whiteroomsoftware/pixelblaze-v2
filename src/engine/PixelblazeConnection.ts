// Framework-free, transport-agnostic connection to a Pixelblaze controller's
// documented WebSocket JSON API. Zero React imports — consistent with the
// engine/UI boundary and the injectable-shim pattern (see builtins.ts/shim.ts).
//
// The module is *isomorphic*: it never references a global `WebSocket`. Instead
// the host injects a factory — the browser passes native `WebSocket`, Node
// passes `ws` — so the same protocol code serves the Node divergence harness
// today and a local bridge later. See docs/prd/Feature — Hardware Connectivity.md.
//
// Scope here is the documented JSON text-frame API only: getVars / setVars /
// ping keepalive / connection lifecycle. Binary-frame decode (listPrograms) and
// the undocumented pattern-push protocol are deliberately out of scope (Phase 2).

/** The slice of the WebSocket API this module needs — satisfied by both the
 *  browser's native `WebSocket` and the Node `ws` package. We use the `on*`
 *  property handlers (not addEventListener) because both implementations
 *  support them and `ev.data` carries the frame payload in each. */
export interface WebSocketLike {
  send(data: string): void
  close(): void
  readyState: number
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
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

  /** Close the socket and reject any in-flight requests. */
  close(): void {
    this.stopPing()
    this.ws?.close()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Send a frame and queue a pending promise keyed by its expected reply field. */
  private request(responseKey: string, frame: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = this._setTimeout(() => {
        this.dequeue(responseKey)
        reject(new Error(`Pixelblaze request timed out waiting for "${responseKey}"`))
      }, this.opts.requestTimeoutMs)

      const queue = this.pending.get(responseKey) ?? []
      queue.push({ resolve, reject, timeout })
      this.pending.set(responseKey, queue)

      try {
        this.sendJson(frame)
      } catch (err) {
        this.dequeue(responseKey)
        this._clearTimeout(timeout)
        reject(err as Error)
      }
    })
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

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return // binary frames out of scope (Phase 2)
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data)
    } catch {
      return // ignore malformed frames rather than crash the connection
    }
    // Resolve the first matching pending request by response field.
    if ('vars' in msg) this.fulfil('vars', msg.vars)
    if ('ack' in msg) this.fulfil('ack', msg.ack)
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
