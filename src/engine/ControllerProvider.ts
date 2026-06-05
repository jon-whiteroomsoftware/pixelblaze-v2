// The transport-provider seam (H2, issue #194). This is the *firewall* that
// contains the "how do we reach a Controller" decision: a Chrome extension
// relaying ws://LAN (H1 spike went GO), or a local Node bridge, or — in tests
// and before any helper is installed — nothing at all.
//
// The app imports ONLY `ControllerProvider` and the types here. It never imports
// a concrete backend, an extension API, or `PixelblazeConnection` directly. Each
// backend (H3 = extension, or the Node-bridge fallback) is one swappable
// implementation of this interface. Keep all packaging specifics — manifest,
// host permissions, the page<->extension handshake, IP entry UI — OUT of this
// module. If something here names "extension" or "bridge", it's in the wrong file.
//
// Pure TypeScript, zero React, zero transport specifics. See
// docs/PXLBLZ Technical Reference.md §13 and ADR-0014.

import type { ProgramListEntry } from './PixelblazeConnection'

export type { ProgramListEntry }

/** Where to reach a Controller. Backend-neutral: the extension provider treats
 *  `address` as a LAN IP it relays to; a bridge provider could treat it the same.
 *  No port here — Pixelblaze only speaks ws:// on 81; a backend may still default
 *  it internally. */
export interface ControllerTarget {
  address: string
}

/** A Controller the provider is currently connected to. `id` is the stable key
 *  the app uses for per-Controller bindings (push overwrite-in-place, panel
 *  selection); a backend may derive it from the address or a device-reported id.
 *  `name` is a human label when the device reports one. */
export interface ConnectedController {
  id: string
  address: string
  name?: string
}

/** A Controller surfaced by auto-discovery (H14, issue #206) but not (yet)
 *  connected. `address` is the LAN IP a subsequent `connect()` targets; `id` is the
 *  device's stable cloud id (a good de-dupe / binding key); `name`/`version` are the
 *  reported nickname and firmware when present. This is the candidate list the UI
 *  offers — distinct from `ConnectedController`, which is a live connection. */
export interface DiscoveredController {
  id: string
  address: string
  name?: string
  version?: string
}

/** Connection status as a discriminated union — the source of truth for the nav
 *  indicator (H4) and the Controller panel (H5+). Deliberately mirrors H4's four
 *  states plus an explicit error.
 *
 *  - `no-extension`     — no relay extension installed/reachable at all.
 *  - `extension-present`— extension is there, but no Controller is connected.
 *  - `connecting`       — a connect() is in flight.
 *  - `connected`        — a Controller is live.
 *  - `error`            — last connect/operation failed; carries a message. */
export type ControllerStatus =
  | { kind: 'no-extension' }
  | { kind: 'extension-present' }
  | { kind: 'connecting'; target: ControllerTarget }
  | { kind: 'connected'; controller: ConnectedController }
  | { kind: 'error'; message: string }

/** Thrown by `connect()` when the user declines the helper's per-IP host-permission
 *  prompt (#229). It is a *user choice*, not a failure to surface as an error pill —
 *  the caller catches this specifically and resets to the pre-connect state so the
 *  next Connect re-prompts. A backend without a permission step never throws it. */
export class ControllerPermissionDeniedError extends Error {
  readonly address: string
  constructor(address: string) {
    super(`Access to ${address} was not authorized`)
    this.name = 'ControllerPermissionDeniedError'
    this.address = address
  }
}

/** What a backend can do beyond read/monitor. Push and compile are gated on the
 *  H8 in-extension-compiler spike and the H10 push pipeline; until those land a
 *  backend reports them `false` and the app hides "Send to Controller". Read /
 *  control (brightness, controls) is assumed available on any connected backend,
 *  so it is not a capability flag. */
export interface ControllerCapabilities {
  /** Can push a (compiled) pattern to the Controller — H10. */
  push: boolean
  /** Can compile pattern source to runnable bytecode — gated by the H8 spike. */
  compile: boolean
}

/** Device config the panel mirrors. Matches `PixelblazeConnection.getConfig()`'s
 *  return so a wrapping backend forwards it unchanged. */
export interface ControllerConfig {
  brightness?: number
  activeProgramId?: string
  activeControls?: Record<string, number>
  /** The device's configured name, when it reports one — the Controller nickname. */
  name?: string
  /** The device's configured pixel count. Editable from the panel via
   *  `setPixelCount` (#213); read here for display and preflight reconciliation. */
  pixelCount?: number
}

/** Live runtime metrics the device reports while running — distinct from stored
 *  config (firmware `getConfig` carries none of this). The panel polls it for the
 *  FPS readout. `fps` is `null` when the device hasn't reported a frame rate yet. */
export interface ControllerTelemetry {
  fps: number | null
}

/**
 * The one interface the app sees. Every method is async: reaching a Controller
 * through a helper is message-passing, never an in-process call — even the
 * firmware's fire-and-forget writes (`setControls`, `setBrightness`) cross the
 * bridge asynchronously, so they resolve when the command has been *sent*, not
 * when the device has applied it (the documented API gives no ack for them).
 */
export interface ControllerProvider {
  /** Static description of what this backend supports. */
  readonly capabilities: ControllerCapabilities

  /** Is the relay helper installed/reachable? Drives no-extension vs extension-present.
   *  Cheap and side-effect-free; safe to poll. */
  detectHelper(): Promise<boolean>

  /** Discover Controllers on the LAN via the cloud discovery service (H14, issue
   *  #206) — a global, not per-Controller, lookup the helper performs (the endpoint
   *  isn't reachable from the page). Returns the candidates the user can connect to;
   *  resolves `[]` on any failure (no helper, no devices, service down) so the UI
   *  degrades to manual IP entry rather than erroring. UDP beacon discovery is not
   *  available to an MV3 extension, so cloud is the only path; coverage holes (AP
   *  mode, discovery disabled on the device) keep manual IP the universal fallback. */
  discover(): Promise<DiscoveredController[]>

  /** Synchronous snapshot of the current status. */
  getStatus(): ControllerStatus

  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe(listener: (status: ControllerStatus) => void): () => void

  /** Connect to a Controller. Moves status through `connecting` to `connected`
   *  (or `error`). Rejects if no helper is present. */
  connect(target: ControllerTarget): Promise<void>

  /** Disconnect the current Controller. Returns to `extension-present` (or
   *  `no-extension`). Safe to call when already disconnected. */
  disconnect(): Promise<void>

  // ── read / control surface (documented JSON API, backend-forwarded) ──────────

  /** Read device config (brightness, active program, live controls). */
  getConfig(): Promise<ControllerConfig>

  /** Read live runtime telemetry (reported FPS). Polled by the Controller panel
   *  while connected; cheap and read-only. */
  getTelemetry(): Promise<ControllerTelemetry>

  /** List the patterns stored on the Controller. */
  listPrograms(): Promise<ProgramListEntry[]>

  /** Read the running pattern's live exported variables (name → value). The panel
   *  watches these read-only; backend-forwarded from the documented `getVars`. */
  getVars(): Promise<Record<string, number>>

  /** Read back the Controller's installed pixel map as coordinate tuples —
   *  `[[x],…]` (1D), `[[x,y],…]` (2D) or `[[x,y,z],…]` (3D) — or `null` when the
   *  device reports no map. Map read-back is an unconfirmed firmware capability
   *  (the H13 spike) that the Send-to-Controller gate pulls forward to check
   *  dimensionality: a backend that cannot read it resolves `null`, so the gate
   *  degrades to connected-only rather than blocking on an unknowable mismatch. */
  getPixelMap(): Promise<number[][] | null>

  /** Set UI control values on the active pattern. `save` persists to flash
   *  (wear cost) — default false. Resolves once the command is sent. */
  setControls(controls: Record<string, number>, save?: boolean): Promise<void>

  /** Set global brightness (0..1). `save` persists to flash — default false.
   *  Resolves once the command is sent. */
  setBrightness(value: number, save?: boolean): Promise<void>

  /** Set the device's configured pixel count. `save` persists to flash — default
   *  true (this is wiring config, not a volatile control, so it should survive a
   *  reboot). Resolves once the command is sent. Also the remedy for an
   *  unconformable map push: a map only applies when its point count exactly
   *  matches `pixelCount` (#213). */
  setPixelCount(value: number, save?: boolean): Promise<void>

  // ── push surface (H10, issue #202; gated by `capabilities`) ─────────────────

  /** Compile pattern source to runnable bytecode (the device's own compiler, run
   *  helper-side). Rejects on a compile error or when the backend lacks the
   *  `compile` capability. The orchestrator (sendPatternToController) frames +
   *  pushes the result. */
  compile(source: string): Promise<Uint8Array>

  /** Push already-compiled bytecode to the connected Controller as the
   *  save-and-run sequence, overwriting the program at `id` in place (reuse an id
   *  to overwrite, mint one to create). Resolves once the frames are sent. */
  pushBytecode(bytecode: Uint8Array, opts: { id: string; name?: string }): Promise<void>

  /** Save a pattern to the Controller as a persisted record (#236) so it appears in
   *  the device's Saved Patterns list — distinct from `pushBytecode`, which loads +
   *  runs a pattern but persists nothing. `pbpBlob` is the encoded Pixelblaze Binary
   *  Pattern (header + name/jpeg/bytecode/source sections, see `encodePbp`); the
   *  backend frames it over `putSourceCode` (type 1) with the program `id`. Reuse the
   *  bound id to overwrite a saved pattern in place, mint one to create. Resolves once
   *  the frames are sent. */
  saveProgram(pbpBlob: Uint8Array, opts: { id: string }): Promise<void>

  /** Write a baked coordinate array to the Controller's single shared pixel map
   *  (H12, issue #204) — the map every pattern on the device reads. `points` are
   *  firmware-normalized `[x,y(,z)]` tuples (the preview's resolved map points); the
   *  backend encodes them to the binary mapData blob and pushes it as a type-8 frame.
   *  `save` persists to flash (default true). Guarded + explicit at the UI layer:
   *  this configures the *installation*, not the pattern. Resolves once sent. */
  setPixelMap(points: number[][], opts?: { save?: boolean }): Promise<void>
}

/** A backend reports no push and no compile until those capabilities ship. */
export const NO_CAPABILITIES: ControllerCapabilities = { push: false, compile: false }

/**
 * The default provider before any helper exists: permanently `no-extension`, no
 * capabilities, every operation rejects. Lets the app (nav indicator, panel)
 * render and be wired against the seam from day one, and gives tests a trivial
 * stand-in. A real backend (H3 extension) replaces it once installed.
 */
export class NullControllerProvider implements ControllerProvider {
  readonly capabilities = NO_CAPABILITIES
  private readonly listeners = new Set<(status: ControllerStatus) => void>()
  private static readonly STATUS: ControllerStatus = { kind: 'no-extension' }

  detectHelper(): Promise<boolean> {
    return Promise.resolve(false)
  }

  discover(): Promise<DiscoveredController[]> {
    return Promise.resolve([])
  }

  getStatus(): ControllerStatus {
    return NullControllerProvider.STATUS
  }

  subscribe(listener: (status: ControllerStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect(_target: ControllerTarget): Promise<void> {
    return Promise.reject(new Error('No Controller helper is installed'))
  }

  disconnect(): Promise<void> {
    return Promise.resolve()
  }

  getConfig(): Promise<ControllerConfig> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  getVars(): Promise<Record<string, number>> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  getPixelMap(): Promise<number[][] | null> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  setControls(_controls: Record<string, number>, _save = false): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  setBrightness(_value: number, _save = false): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  setPixelCount(_value: number, _save = true): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  compile(_source: string): Promise<Uint8Array> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  pushBytecode(_bytecode: Uint8Array, _opts: { id: string; name?: string }): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  saveProgram(_pbpBlob: Uint8Array, _opts: { id: string }): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }

  setPixelMap(_points: number[][], _opts?: { save?: boolean }): Promise<void> {
    return Promise.reject(new Error('Not connected to a Controller'))
  }
}
