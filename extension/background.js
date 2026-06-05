// Service worker for the PXLBLZ-IDE Controller Helper (H3, issue #195).
//
// Owns the real ws://<LAN-IP>:81 sockets — the one thing the https page cannot
// open itself. One long-lived Port per page; sockets are keyed by the connId the
// page minted (see src/engine/RelayWebSocket.ts), so a single page can bridge
// several connections. Frames cross as text, or base64 for binary, because Port
// messaging is JSON-only.
//
// MV3 lifecycle: an open WebSocket with traffic (the app pings every ~5s) keeps
// the worker from idling out on current Chrome. If the worker is nonetheless
// evicted, the socket dies; the page sees a close and its provider reconnects.

const RELAY_SOURCE = 'pblz-relay'

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── per-IP just-in-time host permissions (#229, ADR-0015) ────────────────────
//
// The LAN reach (http://*, ws://*) is OPTIONAL now; we hold it per device IP and
// request it just-in-time. `chrome.permissions.request` can only run in an
// extension page with a user gesture — not here in the SW, not in a content
// script — so the actual grant happens in the action popup (popup.js). This SW
// only DETECTS a missing grant, auto-opens the popup, and waits for the grant to
// land (chrome.permissions.onAdded) or the user to decline (popup reports it, or
// a safety timeout fires). Every device-bound call (connect, compile fetch,
// /pixelmap.dat) passes through `ensureHostPermission` first.

const GRANT_TIMEOUT_MS = 60000

// Device-bound calls blocked on a pending grant, by the IP they need.
const pendingWaiters = []

function pendingGrantIps() {
  return [...new Set(pendingWaiters.map((w) => w.ip))]
}

function settleWaiter(waiter, granted) {
  const i = pendingWaiters.indexOf(waiter)
  if (i === -1) return
  pendingWaiters.splice(i, 1)
  clearTimeout(waiter.timer)
  waiter.resolve(granted)
}

// Resolve any waiter whose origins are now actually granted. Driven by
// chrome.permissions.onAdded (fires no matter where the grant came from) and by
// the popup's explicit "granted" report.
async function reconcileGrants() {
  for (const w of [...pendingWaiters]) {
    if (await chrome.permissions.contains({ origins: w.origins })) settleWaiter(w, true)
  }
}

chrome.permissions.onAdded.addListener(() => {
  reconcileGrants()
})

// Popup ↔ SW channel (distinct target from the offscreen compile channel).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'helper-popup') return
  if (msg.type === 'get-pending') {
    sendResponse({ ips: pendingGrantIps() })
    return
  }
  if (msg.type === 'grant-outcome') {
    if (msg.granted) reconcileGrants()
    // An explicit "Not now" (or a failed request) fails every open waiter so the
    // queued calls don't hang to the timeout.
    else for (const w of [...pendingWaiters]) settleWaiter(w, false)
    sendResponse({ ok: true })
  }
})

// Pull the device host out of either a ws:// url or a bare IP/address.
function hostOf(addressOrUrl) {
  try {
    return new URL(addressOrUrl.includes('://') ? addressOrUrl : `http://${addressOrUrl}`).hostname
  } catch {
    return null
  }
}

// Open the popup (best-effort — openPopup can no-op on some Chrome versions, in
// which case the page-side "permission-needed" hint tells the user to click the
// toolbar icon) and wait for the grant or a decline.
function requestGrantViaPopup(ip, origins) {
  return new Promise((resolve) => {
    const waiter = { ip, origins, resolve }
    pendingWaiters.push(waiter)
    try {
      const opened = chrome.action.openPopup()
      if (opened && opened.catch) opened.catch(() => {})
    } catch {
      // openPopup unavailable; rely on the page hint + manual icon click.
    }
    waiter.timer = setTimeout(() => settleWaiter(waiter, false), GRANT_TIMEOUT_MS)
  })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== RELAY_SOURCE) return
  // Sockets owned by this page, keyed by connId.
  const sockets = new Map()

  const send = (msg) => {
    try {
      port.postMessage(msg)
    } catch {
      // Page went away mid-flight; nothing to do.
    }
  }

  // Gate one device-bound call on holding the per-IP host permission. Returns true
  // when it's safe to proceed. On a missing grant it tells the page (so it can show
  // "click the toolbar icon" if the popup didn't auto-open), opens the popup, and
  // waits; a decline returns false AND emits `permission-denied` so the page can
  // surface it instead of looking like a silent connect failure.
  const ensureGate = async (addressOrUrl) => {
    const ip = hostOf(addressOrUrl)
    if (!ip) return true // unparseable — let the underlying call fail naturally
    const origins = [`http://${ip}/*`, `ws://${ip}/*`]
    if (await chrome.permissions.contains({ origins })) return true
    send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'permission-needed', address: ip })
    const granted = await requestGrantViaPopup(ip, origins)
    if (!granted) {
      send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'permission-denied', address: ip })
    }
    return granted
  }

  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.source !== RELAY_SOURCE || msg.dir !== 'to-helper') return

    // Compile request (#202): correlated by reqId, independent of any socket. The
    // device's own compiler is fetched, extracted, and eval'd in a sandboxed iframe
    // (MV3 CSP forbids eval in the SW), then the bytecode crosses back as base64.
    if (msg.type === 'compile') {
      if (!(await ensureGate(msg.address))) {
        send({
          source: RELAY_SOURCE,
          dir: 'from-helper',
          type: 'compile-result',
          reqId: msg.reqId,
          ok: false,
          error: `access to ${hostOf(msg.address)} not authorized`,
        })
        return
      }
      handleCompile(msg).then(
        (bytecode) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'compile-result',
            reqId: msg.reqId,
            ok: true,
            bytecode: bytesToBase64(bytecode.buffer),
          }),
        (e) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'compile-result',
            reqId: msg.reqId,
            ok: false,
            error: e && e.message ? e.message : String(e),
          }),
      )
      return
    }

    // Map read-back request (#205): like compile, correlated by reqId and independent
    // of any socket. The device's installed pixel map is a plain HTTP GET of
    // /pixelmap.dat (there is no "get map" WS message) — the same HTTP capability the
    // compiler fetch already uses. The blob crosses back as base64; a device with no
    // map (404 or empty body) comes back ok with mapData absent, NOT an error.
    if (msg.type === 'get-map') {
      if (!(await ensureGate(msg.address))) {
        send({
          source: RELAY_SOURCE,
          dir: 'from-helper',
          type: 'map-data',
          reqId: msg.reqId,
          ok: false,
          error: `access to ${hostOf(msg.address)} not authorized`,
        })
        return
      }
      handleGetMap(msg).then(
        (mapBytes) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'map-data',
            reqId: msg.reqId,
            ok: true,
            // Absent mapData ⇒ no installed map; present ⇒ the /pixelmap.dat blob.
            ...(mapBytes ? { mapData: bytesToBase64(mapBytes.buffer) } : {}),
          }),
        (e) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'map-data',
            reqId: msg.reqId,
            ok: false,
            error: e && e.message ? e.message : String(e),
          }),
      )
      return
    }

    // Auto-discovery request (#206): a global, socket-independent cloud lookup. The
    // helper GETs discover.electromage.com/discover — which the https page can't read
    // (no CORS header), the same wall as ws://LAN — and returns the candidate list.
    // UDP beacon discovery is NOT possible here: MV3 extensions have no UDP socket
    // (chrome.sockets.udp is Chrome-Apps-only, deprecated), so cloud is the only path.
    if (msg.type === 'discover') {
      handleDiscover().then(
        (controllers) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'discover-result',
            reqId: msg.reqId,
            ok: true,
            controllers,
          }),
        (e) =>
          send({
            source: RELAY_SOURCE,
            dir: 'from-helper',
            type: 'discover-result',
            reqId: msg.reqId,
            ok: false,
            error: e && e.message ? e.message : String(e),
          }),
      )
      return
    }

    if (msg.type === 'connect') {
      if (!(await ensureGate(msg.url))) {
        // Denied: report a normal-looking failure for this connId on top of the
        // permission-denied feedback ensureGate already sent.
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'access not authorized' })
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
        return
      }
      let ws
      try {
        ws = new WebSocket(msg.url)
      } catch (e) {
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: String(e) })
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
        return
      }
      ws.binaryType = 'arraybuffer'
      sockets.set(msg.connId, ws)
      // TEMP DEBUG (#230): trace the real socket lifecycle per connId.
      console.log(`[pblz-helper] connect ${msg.connId} → ${msg.url} (sockets=${sockets.size})`)
      ws.addEventListener('open', () => {
        console.log(`[pblz-helper] open ${msg.connId}`)
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId })
      })
      ws.addEventListener('message', (ev) => {
        const payload =
          typeof ev.data === 'string' ? { text: ev.data } : { binary: bytesToBase64(ev.data) }
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload })
      })
      ws.addEventListener('error', () => {
        console.log(`[pblz-helper] error ${msg.connId}`)
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'websocket error' })
      })
      ws.addEventListener('close', (ev) => {
        sockets.delete(msg.connId)
        console.log(`[pblz-helper] close ${msg.connId} code=${ev.code} (sockets=${sockets.size})`)
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId, code: ev.code })
      })
      return
    }

    const ws = sockets.get(msg.connId)
    if (!ws) return

    if (msg.type === 'send') {
      try {
        if ('text' in msg.payload) ws.send(msg.payload.text)
        else ws.send(base64ToBytes(msg.payload.binary))
      } catch {
        // Socket not open / already gone; the close path reports it.
      }
    } else if (msg.type === 'close') {
      console.log(`[pblz-helper] page-close ${msg.connId} (readyState=${ws.readyState})`)
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  })

  port.onDisconnect.addListener(() => {
    for (const ws of sockets.values()) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    sockets.clear()
  })
})

// ── compile-in-extension (#202) ──────────────────────────────────────────────
//
// Fetch the device web UI, extract its embedded compiler, eval it in a sandboxed
// iframe (hosted by an offscreen doc — the SW can't eval under MV3 CSP), and
// return the bytecode. Returns a Uint8Array; the caller base64s it for the relay.
//
// The extraction helpers below (getSubstring / extractCompiler / v3AdapterV3 /
// buildCompilerEnv) are a DELIBERATE DUPLICATE of src/engine/compilerExtraction.ts.
// The SW is plain JS outside the Vite bundle and cannot import the tested module,
// so the two must be kept in sync by hand — that engine module is the tested
// mirror (its tests pin this logic). Change one, change the other.

async function handleCompile(msg) {
  const webUI = await fetchWebUI(msg.address)
  const components = v3AdapterV3(webUI)
  for (const k of ['hardwareVariant', 'extendedOperators', 'constants', 'compiler']) {
    if (!components[k]) throw new Error(`compiler extraction miss: ${k} empty — firmware adapter mismatch?`)
  }
  const compilerEnv = buildCompilerEnv(components)
  const result = await compileInSandbox(compilerEnv, msg.patternSrc)
  if (!result.ok) throw new Error(result.error || 'compile failed')
  return new Uint8Array(result.bytecode)
}

// ── map read-back (#205) ─────────────────────────────────────────────────────
//
// GET the device's installed pixel map blob (/pixelmap.dat) over HTTP, the same
// transport the compiler fetch uses. Mirrors getMapData -> getFile('/pixelmap.dat')
// in the reference client (zranger1/pixelblaze-client, pixelblaze.py ~L1675).
// Returns a Uint8Array of the raw blob, or null when the device has no map (the
// firmware answers 404, or 200 with an empty body). The page decodes the blob; a
// real network/HTTP failure rejects so the page can tell "no map" from "unread".
async function handleGetMap(msg) {
  const resp = await fetch(`http://${msg.address}/pixelmap.dat`)
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`GET /pixelmap.dat -> ${resp.status}`)
  const buf = await resp.arrayBuffer()
  if (buf.byteLength === 0) return null
  return new Uint8Array(buf)
}

// ── cloud discovery (#206) ───────────────────────────────────────────────────
//
// GET the cloud discovery service over HTTPS. It matches Controllers by the
// caller's public IP and returns a JSON array of records (verified live 2026-06-04):
//   { id, ip (public), localIp (LAN), name, version, boardType, arch, ... }
// We trim each to the fields the page uses; `localIp` is the address it connects to.
// Needs the discover.electromage.com host permission in the manifest. An empty list
// (no devices, or discovery disabled on them) is a normal ok result, not an error;
// a network/HTTP failure rejects so the page can tell "none found" from "couldn't ask".
const DISCOVER_URL = 'https://discover.electromage.com/discover'

async function handleDiscover() {
  const resp = await fetch(DISCOVER_URL)
  if (!resp.ok) throw new Error(`GET /discover -> ${resp.status}`)
  const records = await resp.json()
  if (!Array.isArray(records)) return []
  return records
    .filter((r) => r && r.id && r.localIp)
    .map((r) => ({ id: r.id, localIp: r.localIp, name: r.name, version: r.version }))
}

// Fetch + gunzip + decode the device web UI (utf-8-sig: strip BOM).
async function fetchWebUI(ip) {
  const resp = await fetch(`http://${ip}/index.html.gz`)
  if (!resp.ok) throw new Error(`GET index.html.gz -> ${resp.status}`)
  const gzBuf = await resp.arrayBuffer()
  const stream = new Response(gzBuf).body.pipeThrough(new DecompressionStream('gzip'))
  let text = await new Response(stream).text()
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM
  return text
}

function getSubstring(text, startValue, endValue) {
  const start = text.indexOf(startValue)
  if (start === -1) return ''
  const finish = text.indexOf(endValue, start)
  if (finish === -1) return ''
  return text.slice(start, finish)
}

function extractCompiler(webUI) {
  let rest = webUI
  while (rest.length > 0) {
    const i = rest.indexOf('<script>')
    if (i === -1) break
    const after = rest.slice(i + '<script>'.length)
    const j = after.indexOf('</script>')
    const script = j === -1 ? after : after.slice(0, j)
    rest = j === -1 ? '' : after.slice(j + '</script>'.length)
    if (script.indexOf('window.compile') !== -1) return script
  }
  return ''
}

// fw > 3.4 adapter. Older firmwares need v2 / v3v1 / v3v2 (see pixelblaze-client).
function v3AdapterV3(webUI) {
  return {
    hardwareVariant: 'var ' + getSubstring(webUI, 'hardwareVariant=', ',varWatcherPoller') + ';',
    extendedOperators: getSubstring(webUI, 'extendedOperators={', ',lastErrorMarkers=') + ';',
    constants:
      'var constants;' + getSubstring(webUI, '"ESP8266"===hardwareVariant&&', ',[])') + ';',
    compiler: extractCompiler(webUI) + ';',
  }
}

// Assemble the string the sandboxed iframe will eval. NOTE: unlike the Python
// PoC we DO NOT prepend `window = {}` — in a browser host `window` is read-only
// and already present, and the compiler attaches itself to the real window.
function buildCompilerEnv(c) {
  return (
    'var predefinedGlobals = ["pixelCount"];\n' +
    c.hardwareVariant +
    '\n' +
    c.constants +
    '\n' +
    c.extendedOperators +
    '\n' +
    c.compiler +
    '\n' +
    `
    var compilePattern = function (src) {
      try {
        var compilerOptions = { predefinedGlobals: predefinedGlobals, extendedOperators: extendedOperators, constants: constants };
        var program = window.compile(src, compilerOptions);
        function surfaceList(list) { return Object.keys(list).reduce(function (r, k) { return r.concat(list[k]); }, []); }
        return { status: "OK", exports: surfaceList(program.exports), compiled: program.compiled };
      } catch (ex) {
        return { status: (ex && ex.description ? ex.description : String(ex)) };
      }
    };
    `
  )
}

async function compileInSandbox(compilerEnv, patternSrc) {
  await ensureOffscreen()
  return await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'compile',
    compilerEnv,
    patternSrc,
  })
}

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['IFRAME_SCRIPTING'],
    justification: 'Host a sandboxed iframe that evaluates the device compiler (remote code).',
  })
}
