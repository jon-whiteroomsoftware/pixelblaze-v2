// The v1 Controller backend: reaches a Pixelblaze through a Chrome extension
// relay (H3, issue #195). It is the productionized H1 spike, behind the H2 seam.
//
// Architecture: this provider owns a PixelblazeConnection whose socket is a
// RelayWebSocket — so every byte of the documented JSON/binary protocol is the
// same code that drives the Node harness; only the transport differs. The
// extension packaging (manifest, service worker, content script) lives entirely
// on the far side of the RelayTransport seam and is never imported here.
//
// What this module adds over the raw connection: the extension-present handshake,
// the ControllerStatus state machine the nav/panel subscribe to, and a bounded
// reconnect when the socket drops unexpectedly (MV3 can evict the service worker).
//
// Pure TypeScript, zero React. The transport is injected; tests drive a fake
// relay that emulates a device end-to-end. main.tsx builds the window-backed one.

import {
  type ControllerProvider,
  type ControllerCapabilities,
  type ControllerStatus,
  type ControllerTarget,
  type ControllerConfig,
  type ControllerTelemetry,
  type ProgramListEntry,
  NO_CAPABILITIES,
} from './ControllerProvider'
import { PixelblazeConnection } from './PixelblazeConnection'
import { RelayWebSocket, RELAY_SOURCE, type RelayTransport } from './RelayWebSocket'

export interface ExtensionControllerProviderOptions {
  transport: RelayTransport
  /** How long detectHelper waits for the extension's ack before deciding it is
   *  absent. Default 500ms. */
  detectTimeoutMs?: number
  /** Keepalive ping interval for the live connection. Default 5000ms — under the
   *  MV3 ~30s idle window, so socket traffic keeps the service worker awake. */
  pingIntervalMs?: number
  /** Per-request reply timeout passed to the connection. Default 5000ms. */
  requestTimeoutMs?: number
  /** Reconnect attempts after an unexpected drop before giving up. Default 3. */
  maxReconnectAttempts?: number
  /** Delay between reconnect attempts. Default 1000ms. */
  reconnectDelayMs?: number
  /** Injectable timers (tests). Default to globals. */
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
}

export class ExtensionControllerProvider implements ControllerProvider {
  readonly capabilities: ControllerCapabilities = NO_CAPABILITIES

  private status: ControllerStatus = { kind: 'no-extension' }
  private readonly listeners = new Set<(status: ControllerStatus) => void>()
  private conn: PixelblazeConnection | null = null
  private target: ControllerTarget | null = null
  private intentionalClose = false
  // True only while we hold a connection we expect to stay up. Gates the close-
  // driven reconnect so a *failed* open (which also fires a close) doesn't retry.
  private expectConnected = false

  private readonly transport: RelayTransport
  private readonly detectTimeoutMs: number
  private readonly pingIntervalMs: number
  private readonly requestTimeoutMs: number
  private readonly maxReconnectAttempts: number
  private readonly reconnectDelayMs: number
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown
  private readonly _clearTimeout: (h: unknown) => void

  constructor(options: ExtensionControllerProviderOptions) {
    this.transport = options.transport
    this.detectTimeoutMs = options.detectTimeoutMs ?? 500
    this.pingIntervalMs = options.pingIntervalMs ?? 5000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000
    this._setTimeout = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this._clearTimeout =
      options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  // ── helper handshake ──────────────────────────────────────────────────────

  /** Ask the relay "are you installed?" and resolve on its ack (or timeout).
   *  Updates no-extension ↔ extension-present when not actively connected. */
  detectHelper(): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const finish = (present: boolean) => {
        if (settled) return
        settled = true
        unsubscribe()
        this._clearTimeout(timer)
        if (this.status.kind === 'no-extension' || this.status.kind === 'extension-present') {
          this.setStatus({ kind: present ? 'extension-present' : 'no-extension' })
        }
        resolve(present)
      }
      const unsubscribe = this.transport.subscribe((msg) => {
        if (msg.source === RELAY_SOURCE && msg.dir === 'from-helper' && msg.type === 'detect-ack') {
          finish(true)
        }
      })
      const timer = this._setTimeout(() => finish(false), this.detectTimeoutMs)
      this.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'detect' })
    })
  }

  getStatus(): ControllerStatus {
    return this.status
  }

  subscribe(listener: (status: ControllerStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // ── connection lifecycle ───────────────────────────────────────────────────

  async connect(target: ControllerTarget): Promise<void> {
    if (!(await this.detectHelper())) {
      const err = new Error('No Controller helper is installed')
      this.setStatus({ kind: 'error', message: err.message })
      throw err
    }
    this.target = target
    this.intentionalClose = false
    await this.openConnection(target)
  }

  /** Open (or reopen) the socket. On success arms reconnect; on failure leaves
   *  the provider in `error` and rethrows. The caller decides whether a failure
   *  is fatal (initial connect) or feeds the retry loop (reconnect). */
  private async openConnection(target: ControllerTarget): Promise<void> {
    this.setStatus({ kind: 'connecting', target })
    const conn = new PixelblazeConnection({
      host: target.address,
      webSocketFactory: (url) => new RelayWebSocket(url, this.transport),
      pingIntervalMs: this.pingIntervalMs,
      requestTimeoutMs: this.requestTimeoutMs,
    })
    conn.on('close', () => this.onSocketClosed())
    this.conn = conn
    try {
      await conn.connect()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connection failed'
      this.conn = null
      this.expectConnected = false
      this.setStatus({ kind: 'error', message })
      throw e
    }
    this.expectConnected = true
    this.setStatus({
      kind: 'connected',
      controller: { id: target.address, address: target.address },
    })
  }

  /** Fires on every socket close. Only a drop of a connection we expected to
   *  stay up triggers reconnect — a close that follows a failed open (or a
   *  user-driven disconnect) is ignored. */
  private onSocketClosed(): void {
    if (this.intentionalClose || !this.expectConnected || !this.target) return
    this.expectConnected = false
    this.scheduleReconnect(this.maxReconnectAttempts)
  }

  /** Bounded reconnect loop. Each attempt reopens the socket; on failure it
   *  chains the next attempt itself (not via the close event) until exhausted. */
  private scheduleReconnect(attemptsLeft: number): void {
    if (attemptsLeft <= 0) {
      this.conn = null
      this.setStatus({ kind: 'error', message: 'Controller connection lost' })
      return
    }
    const target = this.target!
    this.setStatus({ kind: 'connecting', target })
    this._setTimeout(() => {
      if (this.intentionalClose) return
      void this.openConnection(target).catch(() => this.scheduleReconnect(attemptsLeft - 1))
    }, this.reconnectDelayMs)
  }

  disconnect(): Promise<void> {
    this.intentionalClose = true
    this.expectConnected = false
    this.target = null
    this.conn?.close()
    this.conn = null
    // We had a helper to connect through, so fall back to extension-present.
    this.setStatus({ kind: 'extension-present' })
    return Promise.resolve()
  }

  // ── read / control surface (delegated to the connection) ────────────────────

  getConfig(): Promise<ControllerConfig> {
    return this.withConn((conn) => conn.getConfig())
  }

  getTelemetry(): Promise<ControllerTelemetry> {
    return this.withConn((conn) => Promise.resolve({ fps: conn.fps }))
  }

  listPrograms(): Promise<ProgramListEntry[]> {
    return this.withConn((conn) => conn.listPrograms())
  }

  getVars(): Promise<Record<string, number>> {
    return this.withConn((conn) => conn.getVars() as Promise<Record<string, number>>)
  }

  /** Map read-back is the unconfirmed H13 capability; the extension relay cannot
   *  read it yet, so it resolves null. The Send gate degrades to connected-only
   *  rather than blocking on an unknowable dimensionality. */
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(null)
  }

  setControls(controls: Record<string, number>, save = false): Promise<void> {
    return this.fireAndForget((conn) => conn.setControls(controls, save))
  }

  setBrightness(value: number, save = false): Promise<void> {
    return this.fireAndForget((conn) => conn.setBrightness(value, save))
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private setStatus(status: ControllerStatus): void {
    this.status = status
    this.listeners.forEach((l) => l(status))
  }

  private connOrNull(): PixelblazeConnection | null {
    return this.conn && this.conn.isConnected ? this.conn : null
  }

  /** Run a read against the live connection, or reject (never throw sync — the
   *  panel store attaches `.catch` without awaiting). */
  private withConn<T>(fn: (conn: PixelblazeConnection) => Promise<T>): Promise<T> {
    const conn = this.connOrNull()
    if (!conn) return Promise.reject(new Error('Not connected to a Controller'))
    try {
      return fn(conn)
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)))
    }
  }

  private fireAndForget(send: (conn: PixelblazeConnection) => void): Promise<void> {
    const conn = this.connOrNull()
    if (!conn) return Promise.reject(new Error('Not connected to a Controller'))
    try {
      send(conn)
      return Promise.resolve()
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)))
    }
  }
}
