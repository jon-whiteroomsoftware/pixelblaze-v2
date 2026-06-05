// Content script for the PXLBLZ-IDE Controller Helper (H3, issue #195).
//
// It is the page-side end of the relay seam. The app (RelayWebSocket via
// windowRelayTransport) talks to it with window.postMessage; it forwards the
// real socket work to the service worker over a long-lived Port and pumps the
// socket's frames back to the page. The wire shapes match src/engine/RelayWebSocket.ts.
//
// Two responsibilities:
//   1. "detect" is answered here directly — the mere presence of this content
//      script proves the extension is installed, no service-worker wake needed.
//   2. connect/send/close are relayed to the service worker, which owns the ws://.

const RELAY_SOURCE = 'pblz-relay'

// Long-lived channel to the service worker. Reconnects lazily if the worker was
// evicted (getting the port again wakes it).
let port = null

function getPort() {
  if (port) return port
  port = chrome.runtime.connect({ name: RELAY_SOURCE })
  port.onMessage.addListener((msg) => {
    // Everything the worker sends is already a from-helper relay message.
    window.postMessage(msg, window.location.origin)
  })
  port.onDisconnect.addListener(() => {
    port = null
  })
  return port
}

window.addEventListener('message', (event) => {
  // Only trust messages this same document posted to itself. The content-script
  // `matches` already scopes injection to our own origins; checking origin too is
  // cheap defense-in-depth against a same-origin frame spoofing relay traffic.
  if (event.source !== window || event.origin !== window.location.origin) return
  const msg = event.data
  if (!msg || msg.source !== RELAY_SOURCE || msg.dir !== 'to-helper') return

  if (msg.type === 'detect') {
    window.postMessage({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' }, window.location.origin)
    return
  }

  try {
    getPort().postMessage(msg)
  } catch {
    // Worker channel unavailable; surface as a socket error for this connId.
    if (msg.connId) {
      window.postMessage(
        { source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'bridge worker unavailable' },
        window.location.origin,
      )
    }
  }
})
