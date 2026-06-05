# PXLBLZ-IDE Controller Helper (Chrome extension)

The v1 transport helper for the Hardware Connectivity arc (H3, issue #195). It is
the productionized H1 spike (`test/h1-extension-spike/`, GO verdict).

## Why it exists

The IDE is served over **https** (github.io), but a Pixelblaze only speaks
`ws://<LAN-IP>:81`. A page cannot open a plaintext LAN websocket from an https
origin (mixed content). A Chrome extension *can*, so this extension owns the real
socket and relays frames to the page.

## Architecture

```
app (RelayWebSocket / windowRelayTransport)
  │  window.postMessage   { source: 'pblz-relay', dir: 'to-helper' | 'from-helper' }
content.js (content script)   ── detect answered here; rest forwarded ──┐
  │  chrome.runtime Port                                                │
background.js (service worker)  ── owns ws://<ip>:81, one per connId ───┘
```

The page side lives in `src/engine/RelayWebSocket.ts` (a `WebSocketLike` over the
relay) and `src/engine/ExtensionControllerProvider.ts` (the `ControllerProvider`).
Because `RelayWebSocket` is a `WebSocketLike`, the existing `PixelblazeConnection`
protocol code drives it unchanged. Binary frames cross the seam as base64
(`chrome.runtime` messaging is JSON-only).

## Install (developer / unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   this `extension/` folder.
2. Open the IDE (deployed github.io page, or `http://localhost:5174` in dev — both
   are in `content_scripts.matches`).
3. The nav connection dot should leave "no helper" once the handshake completes.
   Enter the Controller's LAN IP and connect.

## Verification checklist (hardware — closes #195)

- [ ] Nav reflects **helper-present** after install (handshake works).
- [ ] Connect to a real Pixelblaze by IP → status **connected**; panel shows live
      active pattern / brightness / fps.
- [ ] Live controls + brightness writes visibly affect the LEDs.
- [ ] Panel **map points** row shows the installed map's coordinate count (read back
      from `/pixelmap.dat`, #205); turns amber when it disagrees with **pixels**.
- [ ] Pull the device off the network → status drops, then **reconnects** when it
      returns (bounded retries).
- [ ] No **Local Network Access** prompt blocks it on current Chrome (re-verify;
      the H1 spike saw none but LNA enforcement is an active rollout).
- [ ] Probe the **minimal `host_permissions`**: this manifest uses broad
      `ws://*/*` + `http://*/*` because the IP is user-entered; narrow if Chrome
      allows a tighter grant for dynamic hosts.

## Known gaps (by design, gated downstream)

- **No discovery.** Manual IP only (H14 adds discovery).
- **Persistent socket vs MV3 eviction.** A pinged socket keeps the worker awake on
  current Chrome; if evicted, the page sees a close and the provider reconnects.
