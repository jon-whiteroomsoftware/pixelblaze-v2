// A WebSocketLike that tunnels a ws:// connection through a relay helper
// (H3, issue #195). A page served over https cannot open ws://<LAN-IP> directly
// (mixed content), but a Chrome extension can — so the real socket lives in the
// extension's service worker and this class is a *proxy* for it: send() and the
// on* handlers cross a postMessage seam to that socket and back.
//
// The point of this proxy is reuse: because it satisfies the same WebSocketLike
// the browser/Node sockets do, the existing PixelblazeConnection protocol engine
// drives it unchanged across the bridge. The extension packaging (manifest,
// service worker, content script) stays entirely on the far side of the seam.
//
// Pure TypeScript, zero React. The transport is injected, so tests drive a fake
// relay with no DOM and no real extension. The browser wiring builds a window-
// backed transport (windowRelayTransport) in main.tsx.

import type { WebSocketLike } from './PixelblazeConnection'

/** One message crossing the relay seam, in either direction. `connId` ties a
 *  message to a specific RelayWebSocket instance (the helper may bridge several
 *  at once). Binary frames travel as base64 because chrome.runtime messaging is
 *  JSON-only and silently drops ArrayBuffers. */
export type RelayMessage =
  // page → helper
  | { source: typeof RELAY_SOURCE; dir: 'to-helper'; type: 'detect' }
  | { source: typeof RELAY_SOURCE; dir: 'to-helper'; type: 'connect'; connId: string; url: string }
  | {
      source: typeof RELAY_SOURCE
      dir: 'to-helper'
      type: 'send'
      connId: string
      payload: RelayPayload
    }
  | { source: typeof RELAY_SOURCE; dir: 'to-helper'; type: 'close'; connId: string }
  // Map read-back (H13, issue #205): the device's installed pixel map is read as a
  // plain HTTP GET of `/pixelmap.dat`, NOT over the ws socket — there is no "get map"
  // WS message. So, like `compile`, this is a one-off request/response correlated by
  // `reqId` and independent of any connection. `address` is the device IP the helper
  // fetches from. Mirrors getMapData -> getFile('/pixelmap.dat') in the reference
  // client (pixelblaze-client/pixelblaze.py ~L1675).
  | {
      source: typeof RELAY_SOURCE
      dir: 'to-helper'
      type: 'get-map'
      reqId: string
      address: string
    }
  // Compile request (H10, issue #202): the device's own compiler runs inside the
  // helper (an offscreen-hosted sandboxed iframe, the only MV3-legal place to eval
  // remote code), not over a ws socket — so this is a one-off request/response
  // correlated by `reqId`, independent of any connection. `address` is the device
  // IP the helper fetches the compiler from.
  | {
      source: typeof RELAY_SOURCE
      dir: 'to-helper'
      type: 'compile'
      reqId: string
      address: string
      patternSrc: string
    }
  // Auto-discovery (H14, issue #206): the cloud discovery service is a plain HTTPS
  // GET of discover.electromage.com/discover (which matches Controllers by the
  // caller's public IP). Like compile/get-map it's a one-off request/response keyed
  // by `reqId` and independent of any connection — and it has NO `address` because
  // it's a global LAN-wide lookup, not a per-device call. Only the helper can make
  // it: the endpoint sends no CORS header, so the page can't read it (the same wall
  // as ws://LAN). UDP beacon discovery is NOT an option — MV3 has no UDP socket.
  | { source: typeof RELAY_SOURCE; dir: 'to-helper'; type: 'discover'; reqId: string }
  // helper → page
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'detect-ack' }
  | {
      source: typeof RELAY_SOURCE
      dir: 'from-helper'
      type: 'compile-result'
      reqId: string
      ok: boolean
      /** Compiled bytecode as base64 (binary can't cross chrome messaging raw). */
      bytecode?: string
      /** Failure reason when `ok` is false. */
      error?: string
    }
  // Reply to `get-map`. `ok` true with `mapData` base64 carries the device's blob;
  // `ok` true with `mapData` absent means the device has no installed map (a clean
  // null, not an error — e.g. an empty body or a 404). `ok` false carries `error`.
  | {
      source: typeof RELAY_SOURCE
      dir: 'from-helper'
      type: 'map-data'
      reqId: string
      ok: boolean
      /** The `/pixelmap.dat` blob as base64; absent when the device has no map. */
      mapData?: string
      /** Failure reason when `ok` is false. */
      error?: string
    }
  // Reply to `discover`. `ok` true carries `controllers` (possibly empty — a clean
  // "found none"); `ok` false carries `error` (the cloud fetch failed). The wire
  // shape is the raw cloud record fields the page needs; the provider maps it to
  // `DiscoveredController`. `localIp` is the LAN address to connect() to; `ip` is
  // the public/WAN IP the service matched on (unused by the page, kept for parity).
  | {
      source: typeof RELAY_SOURCE
      dir: 'from-helper'
      type: 'discover-result'
      reqId: string
      ok: boolean
      controllers?: DiscoveredControllerWire[]
      /** Failure reason when `ok` is false. */
      error?: string
    }
  // Per-IP JIT host permission (#229, ADR-0015). The LAN reach is an optional
  // permission granted per device IP from the helper's action popup. These two are
  // address-keyed (not conn/req-keyed) because the grant is per IP, not per call:
  //  - `permission-needed` — the helper found no grant for `address` and opened the
  //    grant popup; informational, lets the page hint "click the toolbar icon" in
  //    case the popup didn't auto-open.
  //  - `permission-denied` — the user declined (or the request failed/timed out);
  //    the page surfaces it instead of showing a silent connect failure.
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'permission-needed'; address: string }
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'permission-denied'; address: string }
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'open'; connId: string }
  | {
      source: typeof RELAY_SOURCE
      dir: 'from-helper'
      type: 'message'
      connId: string
      payload: RelayPayload
    }
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'close'; connId: string; code?: number }
  | { source: typeof RELAY_SOURCE; dir: 'from-helper'; type: 'error'; connId: string; message?: string }

/** A frame payload across the seam: text frames as-is, binary as base64. */
export type RelayPayload = { text: string } | { binary: string }

/** One Controller as the cloud discovery service reports it, trimmed to the fields
 *  the page uses. Mirrors the `discover.electromage.com/discover` JSON record
 *  (verified live 2026-06-04): `localIp` is the LAN address to connect to, `id` is
 *  the stable device id, `name` the nickname, `version` the firmware. */
export interface DiscoveredControllerWire {
  id: string
  localIp: string
  name?: string
  version?: string
}

/** Discriminates this app's relay traffic from any other postMessage chatter. */
export const RELAY_SOURCE = 'pblz-relay' as const

/** The seam RelayWebSocket talks through. `post` sends a message to the helper;
 *  `subscribe` registers a listener for messages coming back, returning an
 *  unsubscribe. The window-backed implementation lives in main.tsx; tests pass a
 *  fake. */
export interface RelayTransport {
  post(message: RelayMessage): void
  subscribe(listener: (message: RelayMessage) => void): () => void
}

// readyState values per the WebSocket spec.
const CONNECTING = 0
const OPEN = 1
const CLOSED = 3

let nextConnId = 0

export class RelayWebSocket implements WebSocketLike {
  readyState = CONNECTING
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null

  private readonly connId = `c${nextConnId++}`
  private readonly transport: RelayTransport
  private readonly unsubscribe: () => void

  constructor(url: string, transport: RelayTransport) {
    this.transport = transport
    this.unsubscribe = transport.subscribe((msg) => this.handle(msg))
    this.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'connect', connId: this.connId, url })
  }

  send(data: string | Uint8Array): void {
    const payload: RelayPayload =
      typeof data === 'string' ? { text: data } : { binary: bytesToBase64(data) }
    this.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'send', connId: this.connId, payload })
  }

  close(): void {
    if (this.readyState === CLOSED) return
    this.readyState = CLOSED
    this.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'close', connId: this.connId })
    this.unsubscribe()
  }

  private handle(msg: RelayMessage): void {
    if (msg.source !== RELAY_SOURCE || msg.dir !== 'from-helper') return
    if (!('connId' in msg) || msg.connId !== this.connId) return

    switch (msg.type) {
      case 'open':
        if (this.readyState === CONNECTING) {
          this.readyState = OPEN
          this.onopen?.({})
        }
        break
      case 'message':
        this.onmessage?.({ data: decodePayload(msg.payload) })
        break
      case 'error':
        this.onerror?.({ message: msg.message })
        break
      case 'close':
        if (this.readyState !== CLOSED) {
          this.readyState = CLOSED
          this.onclose?.({ code: msg.code })
          this.unsubscribe()
        }
        break
    }
  }
}

/** Decode a relay payload back to what onmessage handlers expect: a string for
 *  text frames, a Uint8Array for binary (PixelblazeConnection.toUint8Array
 *  accepts it). */
function decodePayload(payload: RelayPayload): string | Uint8Array {
  return 'text' in payload ? payload.text : base64ToBytes(payload.binary)
}

// ── base64 <-> bytes (uses the platform atob/btoa; present in browser, jsdom,
//    and modern Node) ──────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
