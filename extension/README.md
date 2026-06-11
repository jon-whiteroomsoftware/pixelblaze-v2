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
background.js (service worker)  ───────────────────────────────────────┘
  ├─ owns ws://<ip>:81 (one socket per connId) — the live connection
  ├─ compile: fetch http://<ip>/index.html.gz → extract the device compiler →
  │    eval it in offscreen.html ▸ sandbox.html (the only MV3-legal place to eval)
  ├─ get-map: HTTP GET http://<ip>/pixelmap.dat (#205)
  └─ discover: HTTPS GET discover.electromage.com/discover (#206)
popup.html / popup.js (action popup)  ── per-IP host-permission grant (#229)
```

The page side lives in `src/engine/RelayWebSocket.ts` (a `WebSocketLike` over the
relay) and `src/engine/ExtensionControllerProvider.ts` (the `ControllerProvider`).
Because `RelayWebSocket` is a `WebSocketLike`, the existing `PixelblazeConnection`
protocol code drives it unchanged. The `compile`, `get-map`, and `discover` calls
are one-off request/response round-trips keyed by `reqId`, independent of any
socket. Binary frames and blobs cross the seam as base64 (`chrome.runtime`
messaging is JSON-only).

## Host permissions — per-IP, just-in-time (#229)

The LAN reach is **optional** and granted **per device IP, on demand**, rather than
held as a broad static permission (which Web Store scanners flag as a network-
sniffing surface):

```json
"host_permissions": ["https://discover.electromage.com/*"],
"optional_host_permissions": ["http://*/*", "ws://*/*"]
```

Only cloud discovery is required (it must work before any device IP is known). The
flow when the app connects to an IP the extension doesn't yet hold:

```
service worker (background.js) gates every device-bound call (connect, compile
  fetch, /pixelmap.dat) on chrome.permissions.contains({http://IP/*, ws://IP/*})
  │  missing → opens the action popup (chrome.action.openPopup) + tells the page
action popup (popup.html / popup.js)
  │  chrome.permissions.request(...) inside its own click gesture — the ONLY
  │  context allowed to request (content scripts can't; the SW has no gesture)
Chrome's native "Allow access to <IP>?" dialog == the actual grant
  │  permissions.onAdded → SW unblocks the queued call and proceeds
```

A decline crosses back to the page as `permission-denied` (see `RelayWebSocket.ts`).
`ExtensionControllerProvider` rejects the in-flight `connect()` with a typed
`ControllerPermissionDeniedError` and resets itself to the idle `extension-present`
state; the controller store catches that specific error and drops the half-created
entry, so the UI returns to the pre-connect "no controller" state and the next
Connect simply re-prompts. A decline is a user choice, not an error pill to dwell on.

`chrome.action.openPopup()` works even when the action isn't pinned (the popup
anchors to the Extensions overflow menu). If it ever no-ops on a given Chrome, the
connection sits in `connecting` until the grant window (60s) times out and then
resets the same way a decline does. The SW also emits an informational
`permission-needed` the moment it opens the popup, and the page surfaces that as an
immediate in-app "authorize via the helper" hint rather than waiting on the timeout.

## Install

Normal users should install the published helper from the Chrome Web Store:

https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg

After installing it, open the IDE and use the top-right Controller connect control.
If the IDE tab was already open while installing, click **I've installed it** in the
connect dropdown; Chrome only injects newly installed content scripts on navigation,
so the app reloads the tab if the helper is not visible yet.
The first connection to a new Controller IP opens the helper popup to authorize that
specific local device.

## Install (developer / unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select
   this `extension/` folder.
2. Open the IDE (deployed github.io page, or `http://localhost:5174` in dev — both
   are in `content_scripts.matches`).
3. The nav connection dot should leave "no helper" once the handshake completes.
   Enter the Controller's LAN IP (or pick a discovered device) and connect. The
   first connection to a new IP opens the helper's popup to authorize that IP
   (see Host permissions, above).

## Verification checklist (hardware)

The core relay was verified on hardware for #195; the per-IP permission items
below are the outstanding checks for the #229 lockdown.

- [ ] Nav reflects **helper-present** after install (handshake works).
- [ ] Connect to a real Pixelblaze by IP → status **connected**; panel shows live
      active pattern / brightness / fps.
- [ ] Live controls + brightness writes visibly affect the LEDs.
- [ ] Panel **map points** row shows the installed map's coordinate count (read back
      from `/pixelmap.dat`, #205); turns amber when it disagrees with **pixels**.
- [ ] Pull the device off the network → status drops, then **reconnects** when it
      returns (bounded retries).
- [ ] **Per-IP grant flow (#229):** first connect to a new IP auto-opens the popup;
      granting Chrome's native dialog lets the connection proceed; the IP then
      connects with no prompt on subsequent sessions. Verify `chrome.action.openPopup()`
      actually opens on the test Chrome (else the page hint must point to the icon).
- [ ] **Decline path:** declining the prompt resets the app to the pre-connect "no
      controller" state (no stuck error pill, no spinning reconnect); clicking
      Connect again re-prompts.
- [ ] **Compile path still works after dropping `web_accessible_resources`** — a Send
      to a granted device still returns bytecode and renders live.
- [ ] No **Local Network Access** prompt stacks on top (extensions are exempt from
      Chrome's LNA prompt; confirm no second dialog appears).

## Chrome Web Store submission

The reviewer-facing paperwork (privacy policy URL, single-purpose statement, per-
permission justifications, listing-metadata checklist, store description) lives in
`docs/chrome-web-store-submission.md` (#234). The hosted privacy policy is
`public/privacy.html`, deployed with the app to
`https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/privacy.html`. The manifest is
distribution-agnostic: the same artifact loads unpacked or ships from the Store.

## Known gaps (by design)

- **Discovery is cloud-only.** Devices are found via `discover.electromage.com`
  (#206), which matches them by your public IP; there is no LAN UDP-beacon
  discovery (MV3 extensions have no UDP socket). A device with cloud discovery
  disabled won't appear — connect to it by manual IP instead.
- **Persistent socket vs MV3 eviction.** A pinged socket keeps the worker awake on
  current Chrome; if evicted, the page sees a close and the provider reconnects.
