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
  ControllerPermissionDeniedError,
  type ControllerProvider,
  type ControllerCapabilities,
  type ControllerStatus,
  type ControllerTarget,
  type ControllerConfig,
  type ControllerTelemetry,
  type DiscoveredController,
  type ProgramListEntry,
} from './ControllerProvider'
import { PixelblazeConnection } from './PixelblazeConnection'
import { encodeMapData, decodeMapData } from './mapPush'
import {
  RelayWebSocket,
  RELAY_SOURCE,
  base64ToBytes,
  type RelayTransport,
} from './RelayWebSocket'

export interface ExtensionControllerProviderOptions {
  transport: RelayTransport
  /** How long detectHelper waits for the extension's ack before deciding it is
   *  absent. Default 500ms. */
  detectTimeoutMs?: number
  /** Keepalive ping interval for the live connection. Also the watchdog's check
   *  cadence (it evaluates staleness on each tick), so it bounds how fast a drop
   *  is noticed. Default 1000ms — well under the MV3 ~30s idle window, and fast
   *  enough that idle detection lands within a few seconds. */
  pingIntervalMs?: number
  /** Per-request reply timeout passed to the connection. Default 5000ms. */
  requestTimeoutMs?: number
  /** Liveness watchdog window passed to the connection: declare the Controller
   *  gone after this much inbound silence (no reply/ack/fps), even with no socket
   *  close. Default 4000ms — the device streams fps several times a second, so a
   *  few seconds of silence unambiguously means it is gone; a transient blip just
   *  triggers a cheap auto-reconnect. */
  livenessTimeoutMs?: number
  /** Reconnect attempts after an unexpected drop before giving up. Default
   *  `Infinity` — a powered-off Controller is expected to return, so we keep
   *  probing (status stays `connecting`) until it does or the user disconnects.
   *  Set a finite value to cap it. */
  maxReconnectAttempts?: number
  /** Delay between reconnect attempts. Default 1000ms. */
  reconnectDelayMs?: number
  /** How long a compile round-trip waits for the helper's result before failing.
   *  The helper fetches + gunzips the ~1.2MB device web UI and evals the ~170k-char
   *  compiler, so this is generous. Default 20000ms. */
  compileTimeoutMs?: number
  /** How long a map read-back round-trip waits for the helper's reply before
   *  resolving null. A plain HTTP GET of `/pixelmap.dat`, so much cheaper than
   *  compile. Default 5000ms. */
  getMapTimeoutMs?: number
  /** How long a discovery round-trip waits for the helper's reply before resolving
   *  `[]`. A single HTTPS GET of the cloud discovery service. Default 5000ms. */
  discoverTimeoutMs?: number
  /** Injectable timers (tests). Default to globals. */
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
}

export class ExtensionControllerProvider implements ControllerProvider {
  // Push + compile are GO: the H8 spike proved the device's compiler runs in the
  // helper (offscreen-hosted sandboxed iframe) and the bytecode renders live (#200).
  readonly capabilities: ControllerCapabilities = { push: true, compile: true }

  private status: ControllerStatus = { kind: 'no-extension' }
  private readonly listeners = new Set<(status: ControllerStatus) => void>()
  private conn: PixelblazeConnection | null = null
  private target: ControllerTarget | null = null
  private intentionalClose = false
  // True only while we hold a connection we expect to stay up. Gates the close-
  // driven reconnect so a *failed* open (which also fires a close) doesn't retry.
  private expectConnected = false
  // Set when the helper reports the user declined the per-IP host permission for
  // the address we're connecting to (#229). It resets the provider to the pre-
  // connect idle state (extension-present) rather than an error pill, makes the
  // in-flight connect() reject with a ControllerPermissionDeniedError (so the store
  // can clear the half-created entry and let the next Connect re-prompt), and halts
  // the reconnect loop.
  private permissionBlocked = false

  private readonly transport: RelayTransport
  private readonly detectTimeoutMs: number
  private readonly pingIntervalMs: number
  private readonly requestTimeoutMs: number
  private readonly livenessTimeoutMs: number
  private readonly maxReconnectAttempts: number
  private readonly reconnectDelayMs: number
  private readonly compileTimeoutMs: number
  private readonly getMapTimeoutMs: number
  private readonly discoverTimeoutMs: number
  private compileSeq = 0
  private mapSeq = 0
  private discoverSeq = 0
  private readonly _setTimeout: (fn: () => void, ms: number) => unknown
  private readonly _clearTimeout: (h: unknown) => void

  constructor(options: ExtensionControllerProviderOptions) {
    this.transport = options.transport
    this.detectTimeoutMs = options.detectTimeoutMs ?? 500
    this.pingIntervalMs = options.pingIntervalMs ?? 1000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5000
    this.livenessTimeoutMs = options.livenessTimeoutMs ?? 4000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1000
    this.compileTimeoutMs = options.compileTimeoutMs ?? 20000
    this.getMapTimeoutMs = options.getMapTimeoutMs ?? 5000
    this.discoverTimeoutMs = options.discoverTimeoutMs ?? 5000
    this._setTimeout = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
    this._clearTimeout =
      options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

    // Long-lived watch for per-IP permission feedback (#229). Address-keyed, so it
    // lives here rather than in a per-call subscription. The helper's popup owns the
    // actual grant; we only react to a decline, surfacing it as a clear error and
    // halting reconnect for the address we're targeting.
    this.transport.subscribe((msg) => {
      if (msg.source !== RELAY_SOURCE || msg.dir !== 'from-helper') return
      // Only while we're (re)connecting to this address — a live connection means
      // the IP is already granted, so a stray denial can't be for it.
      if (
        msg.type === 'permission-denied' &&
        this.target?.address === msg.address &&
        this.status.kind !== 'connected'
      ) {
        this.failPermission()
      }
    })
  }

  /** The user declined the helper's per-IP host-permission prompt. Reset to the
   *  pre-connect idle state (a decline is a user choice, not an error to dwell on)
   *  and halt the reconnect loop. We do NOT close the socket here — the helper
   *  always follows a denial with the connId error/close, which rejects the in-
   *  flight openConnection; permissionBlocked turns that rejection into a
   *  ControllerPermissionDeniedError and keeps this idle status from being
   *  overwritten with an error pill. */
  private failPermission(): void {
    this.permissionBlocked = true
    this.intentionalClose = true
    this.expectConnected = false
    this.setStatus({ kind: 'extension-present' })
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

  /** Discover Controllers via the cloud service (H14, #206). Like compile/get-map
   *  it's a one-off reqId-keyed relay round-trip — but global (no `address`), since
   *  it's a LAN-wide cloud lookup. Only the helper can reach the endpoint (no CORS),
   *  so the page posts `discover` and waits for `discover-result`. Any failure or a
   *  timeout resolves `[]` (never throws): discovery is best-effort and the UI falls
   *  back to manual IP entry. The wire records are mapped to DiscoveredController
   *  (`localIp` → `address`). */
  discover(): Promise<DiscoveredController[]> {
    const reqId = `discover-${this.discoverSeq++}`
    return new Promise<DiscoveredController[]>((resolve) => {
      let settled = false
      const finish = (value: DiscoveredController[]) => {
        if (settled) return
        settled = true
        unsubscribe()
        this._clearTimeout(timer)
        resolve(value)
      }
      const unsubscribe = this.transport.subscribe((msg) => {
        if (
          msg.source === RELAY_SOURCE &&
          msg.dir === 'from-helper' &&
          msg.type === 'discover-result' &&
          msg.reqId === reqId
        ) {
          if (msg.ok && msg.controllers) {
            finish(
              msg.controllers.map((c) => ({
                id: c.id,
                address: c.localIp,
                name: c.name || undefined,
                version: c.version || undefined,
              })),
            )
          } else {
            finish([])
          }
        }
      })
      const timer = this._setTimeout(() => finish([]), this.discoverTimeoutMs)
      this.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'discover', reqId })
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
    this.permissionBlocked = false
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
      livenessTimeoutMs: this.livenessTimeoutMs,
    })
    conn.on('close', () => this.onSocketClosed())
    conn.on('stale', () => this.onSocketStale())
    this.conn = conn
    try {
      await conn.connect()
    } catch (e) {
      this.conn = null
      this.expectConnected = false
      // A permission decline already reset us to idle (extension-present); surface
      // it as the typed error the store resets on, not the generic socket failure
      // the rejection carries, and leave the idle status in place.
      if (this.permissionBlocked) throw new ControllerPermissionDeniedError(target.address)
      const message = e instanceof Error ? e.message : 'Connection failed'
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

  /** Fires when the watchdog declares the Controller silent without a socket
   *  close (silent power-off, evicted MV3 worker). We explicitly tear the dead
   *  socket down — its own `close` is gated out by `expectConnected` — then enter
   *  the same bounded reconnect loop a clean drop would. */
  private onSocketStale(): void {
    if (this.intentionalClose || !this.expectConnected || !this.target) return
    this.expectConnected = false
    this.conn?.close()
    this.conn = null
    this.scheduleReconnect(this.maxReconnectAttempts)
  }

  /** Bounded reconnect loop. Each attempt reopens the socket; on failure it
   *  chains the next attempt itself (not via the close event) until exhausted. */
  private scheduleReconnect(attemptsLeft: number): void {
    // A permission decline (or a user disconnect) halts the loop — retrying the
    // same un-granted IP would only re-prompt and be declined again.
    if (this.intentionalClose) return
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

  /** Read the device's installed pixel map (H13, issue #205). The current map is a
   *  plain HTTP GET of `/pixelmap.dat`, which only the helper can do (mixed-content
   *  / CORS) — so, like compile, it's a one-off reqId-keyed relay round-trip, not a
   *  ws call. The helper returns the raw blob as base64; we decode it to the baked
   *  [0,1] coordinate array. A device with no map, a read failure, or a timeout all
   *  resolve null (never throw) — the connect path stays fast and failure-tolerant,
   *  and the Send gate degrades to connected-only rather than blocking. */
  getPixelMap(): Promise<number[][] | null> {
    const target = this.target
    if (!target) return Promise.resolve(null)
    const reqId = `get-map-${this.mapSeq++}`
    return new Promise<number[][] | null>((resolve) => {
      let settled = false
      const finish = (value: number[][] | null) => {
        if (settled) return
        settled = true
        unsubscribe()
        this._clearTimeout(timer)
        resolve(value)
      }
      const unsubscribe = this.transport.subscribe((msg) => {
        if (
          msg.source === RELAY_SOURCE &&
          msg.dir === 'from-helper' &&
          msg.type === 'map-data' &&
          msg.reqId === reqId
        ) {
          if (msg.ok && msg.mapData != null) {
            finish(decodeMapData(base64ToBytes(msg.mapData)))
          } else {
            // No map on the device, or a read failure — both are "no usable map".
            finish(null)
          }
        }
      })
      const timer = this._setTimeout(() => finish(null), this.getMapTimeoutMs)
      this.transport.post({
        source: RELAY_SOURCE,
        dir: 'to-helper',
        type: 'get-map',
        reqId,
        address: target.address,
      })
    })
  }

  setControls(controls: Record<string, number>, save = false): Promise<void> {
    return this.fireAndForget((conn) => conn.setControls(controls, save))
  }

  setBrightness(value: number, save = false): Promise<void> {
    return this.fireAndForget((conn) => conn.setBrightness(value, save))
  }

  setPixelCount(value: number, save = true): Promise<void> {
    return this.fireAndForget((conn) => conn.setPixelCount(value, save))
  }

  // ── push surface (H10, issue #202) ──────────────────────────────────────────

  /** Compile pattern source to bytecode helper-side. The device's own compiler can
   *  only be eval'd inside the helper's offscreen-hosted sandboxed iframe (MV3 CSP),
   *  so this is a one-off relay round-trip — post a `compile` request keyed by a
   *  fresh reqId, resolve on the matching `compile-result`. Needs a live target so
   *  the helper knows which device to fetch the compiler from; rejects otherwise. */
  compile(source: string): Promise<Uint8Array> {
    const target = this.target
    if (!target) return Promise.reject(new Error('Not connected to a Controller'))
    const reqId = `compile-${this.compileSeq++}`
    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        unsubscribe()
        this._clearTimeout(timer)
        fn()
      }
      const unsubscribe = this.transport.subscribe((msg) => {
        if (
          msg.source === RELAY_SOURCE &&
          msg.dir === 'from-helper' &&
          msg.type === 'compile-result' &&
          msg.reqId === reqId
        ) {
          if (msg.ok && msg.bytecode != null) {
            const bytecode = base64ToBytes(msg.bytecode)
            finish(() => resolve(bytecode))
          } else {
            finish(() => reject(new Error(msg.error || 'Compile failed in helper')))
          }
        }
      })
      const timer = this._setTimeout(
        () => finish(() => reject(new Error('Compile timed out'))),
        this.compileTimeoutMs,
      )
      this.transport.post({
        source: RELAY_SOURCE,
        dir: 'to-helper',
        type: 'compile',
        reqId,
        address: target.address,
        patternSrc: source,
      })
    })
  }

  /** Push compiled bytecode over the live connection (save + run, overwrite-in-
   *  place at `id`). Fire-and-forget at the protocol level. */
  pushBytecode(bytecode: Uint8Array, opts: { id: string; name?: string }): Promise<void> {
    return this.fireAndForget((conn) => conn.pushByteCode(bytecode, opts))
  }

  /** Encode the baked coordinate array to the firmware mapData blob and write it to
   *  the device's single shared map slot over the live connection (H12, #204).
   *  Fire-and-forget at the protocol level. */
  setPixelMap(points: number[][], opts: { save?: boolean } = {}): Promise<void> {
    const mapData = encodeMapData(points)
    return this.fireAndForget((conn) => conn.putPixelMap(mapData, opts))
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
