// H1 spike (#193) service worker. Throwaway, no product code.
//
// Opens a *fresh* ws:// to the Controller per relayed command rather than
// holding a long-lived socket. This deliberately sidesteps the MV3 worker-idle
// question (does the socket die when the service worker is evicted?) for the
// go/no-go test -- but that lifecycle behaviour is exactly what report.md must
// record for the productionized provider (H3).

const DEVICE_IP = "192.168.8.224"; // TODO: set to your Controller's LAN IP
const DEVICE_PORT = 81; // the only port a Pixelblaze speaks ws:// on
const TIMEOUT_MS = 5000;

// Open ws://<ip>:81, send one JSON command, collect the device's JSON text-frame
// replies for `collectMs`, then resolve with everything heard. Pixelblaze
// interleaves binary preview frames with JSON text frames; we keep only the
// parsed JSON text frames. A write-only command (e.g. {brightness}) simply
// returns an empty `frames` array -- still ok:true, because the socket opened
// and the command crossed the bridge to the hardware.
function relay(command, collectMs) {
  return new Promise((resolve) => {
    const url = `ws://${DEVICE_IP}:${DEVICE_PORT}`;
    const frames = [];
    let settled = false;
    let collectTimer;
    let ws;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(collectTimer);
      try {
        if (ws) ws.close();
      } catch {
        // ignore close errors
      }
      resolve(result);
    };

    const timer = setTimeout(
      () =>
        done({
          ok: false,
          error: `timeout after ${TIMEOUT_MS}ms (no open from ${url})`,
        }),
      TIMEOUT_MS,
    );

    try {
      ws = new WebSocket(url);
    } catch (e) {
      return done({ ok: false, error: `WebSocket ctor threw: ${e}` });
    }

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(command));
      // Give the device a window to answer (if this command has a reply at all).
      collectTimer = setTimeout(() => done({ ok: true, frames }), collectMs);
    });

    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return; // ignore binary preview frames
      try {
        frames.push(JSON.parse(event.data));
      } catch {
        // ignore non-JSON text frames
      }
    });

    ws.addEventListener("error", () => {
      done({
        ok: false,
        error: `WebSocket error to ${url} (LNA prompt declined? wrong IP? device offline?)`,
      });
    });

    ws.addEventListener("close", (event) => {
      if (!settled) {
        done({ ok: false, error: `socket closed before open (code ${event.code})` });
      }
    });
  });
}

// The content-script relay forwards page requests here. Each request carries an
// arbitrary Pixelblaze command object plus how long to listen for replies.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "relay") return;
  relay(msg.command, msg.collectMs ?? 700).then(sendResponse);
  return true; // keep the channel open for the async sendResponse
});
