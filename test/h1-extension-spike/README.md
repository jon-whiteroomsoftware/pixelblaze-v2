# H1 spike: can a Chrome extension relay `ws://LAN` to the https page? (#193)

The single **go/no-go gate** for the whole Hardware-Connectivity arc (epic #208). It proves
the one structurally-unavoidable thing: a page served over **https** (github.io) cannot open
`ws://<LAN-IP>` directly (mixed content), but a **Chrome extension** can open it and relay
the result back. If this passes, the arc packages as an extension; if it fails, #195 falls
back to the Node bridge and nothing else in the arc changes.

**This is a human-in-the-loop test.** It needs a physical Pixelblaze on your LAN and a real
Chrome profile (LNA prompts don't appear in automation). It is throwaway spike code, not
product code, and is excluded from the commit gate.

## What's here

| path | role |
|---|---|
| `extension/manifest.json` | Minimal MV3 manifest. Hardcoded host perms, content-script relay, no UI/storage. |
| `extension/background.js` | Service worker. Opens a fresh `ws://<ip>:81` per command, sends an arbitrary Pixelblaze JSON command, returns the device's JSON reply frames. |
| `extension/relay.js` | Content script. Bridges page `window.postMessage` <-> `chrome.runtime`, passing commands straight through. |
| `page/console-snippet.js` | Fastest acceptance test: paste into the console of the deployed origin. Runs a brightness write/read round-trip. |
| `page/index.html` + `page/page.js` | Optional standalone deployable test page. |
| `report.md` | Fill this in after running. The actual deliverable of the spike. |

## Setup (2 edits)

1. In **`extension/background.js`** set `DEVICE_IP` to your Controller's LAN IP.
2. In **`extension/manifest.json`** set both `host_permissions` entries to the same IP.

(They're hardcoded on purpose -- no discovery, no UI. Keep the two in sync.)

## Run

1. `chrome://extensions` -> enable **Developer mode** -> **Load unpacked** -> select the
   `extension/` folder.
2. Open the **deployed https origin** in that same Chrome profile:
   `https://jon-whiteroomsoftware.github.io/pixelblaze-v2/` (any page on that origin -- the
   content script is injected by URL match, not by which page it is).
   - Confirm in `chrome://extensions` that the spike has no errors and the service worker is
     "active" (or wakes on demand).
3. Open DevTools **Console**, paste the contents of **`page/console-snippet.js`**, hit Enter.
   (Chrome may make you type `allow pasting` once before it runs console paste.)
4. **Clear the Local Network Access prompt** if Chrome shows one (this is the thing the spike
   exists to observe).
5. **Watch the actual LEDs.** The snippet runs a write/read round-trip across the bridge:
   read config -> dim to **1/3** -> raise to **2/3** -> restore -> read config again. You
   should physically see the lights dim then brighten -- that is the hardware round-trip.
   Expected final console line:
   `[H1 spike] OK -- write/read round-trip confirmed. brightness now reads ...`
   (or, if this firmware does not report a readable brightness, an OK line asking you to
   confirm the dim/brighten visually -- the writes still crossed the bridge).

### Acceptance

A **write reaches a real device** and a read confirms it, through the extension, from the
**https page** -- i.e. the LEDs visibly dim to 1/3 then rise to 2/3, including clearing any
Chrome Local Network Access prompt. ✅ / ❌ -> record in `report.md`.

## Optional: standalone page instead of the console

Copy `page/` into the app's `public/h1-spike/` and deploy; open
`/pixelblaze-v2/h1-spike/` and click **Run brightness round-trip**. Same path, with an
"extension detected" handshake indicator. Delete it from `public/` afterward -- spike, not
product.

## After running

Fill in **`report.md`** (works / Chrome version / prompts seen / SW-lifecycle gotchas), then
report the go/no-go on issue #193. On **go**, #194 (transport seam) and #195 (extension
provider) proceed. On **no-go**, #195 swaps to the Node bridge.
