// H1 spike (#193) content-script relay. Injected into the deployed https
// origin. Bridges the page world (window.postMessage, no chrome.* access) and
// the service worker (chrome.runtime). This is the "content-script relay"
// option from the issue -- it avoids juggling an unstable unpacked-extension
// ID, which the externally_connectable route would require.

const TAG_REQ = 'pbx-h1-spike/request'
const TAG_RES = 'pbx-h1-spike/response'
const TAG_PRESENT = 'pbx-h1-spike/present'
const TAG_PING = 'pbx-h1-spike/ping'

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const msg = event.data
  if (!msg) return

  // Presence handshake: the content script runs at document_start and broadcasts
  // TAG_PRESENT before the page's listener exists, so the page also polls with a
  // ping once it's ready. Answer it.
  if (msg.tag === TAG_PING) {
    window.postMessage({ tag: TAG_PRESENT }, '*')
    return
  }

  if (msg.tag !== TAG_REQ) return

  // Pass the page's arbitrary Pixelblaze command straight through to the worker.
  chrome.runtime.sendMessage(
    { type: 'relay', command: msg.command, collectMs: msg.collectMs },
    (reply) => {
      const err = chrome.runtime.lastError
      window.postMessage(
        {
          tag: TAG_RES,
          id: msg.id,
          ok: !err && !!reply && reply.ok === true,
          frames: reply ? reply.frames : undefined,
          error: err ? err.message : reply ? reply.error : 'no reply from service worker',
        },
        '*',
      )
    },
  )
})

// Announce presence so a page can detect the extension is installed
// (a preview of the H3 "extension installed?" handshake).
window.postMessage({ tag: TAG_PRESENT }, '*')
