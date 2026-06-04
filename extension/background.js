// Service worker for the Pixelblaze IDE Controller Bridge (H3, issue #195).
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

  port.onMessage.addListener((msg) => {
    if (!msg || msg.source !== RELAY_SOURCE || msg.dir !== 'to-helper') return

    // Compile request (#202): correlated by reqId, independent of any socket. The
    // device's own compiler is fetched, extracted, and eval'd in a sandboxed iframe
    // (MV3 CSP forbids eval in the SW), then the bytecode crosses back as base64.
    if (msg.type === 'compile') {
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

    if (msg.type === 'connect') {
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
      ws.addEventListener('open', () => send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId }))
      ws.addEventListener('message', (ev) => {
        const payload =
          typeof ev.data === 'string' ? { text: ev.data } : { binary: bytesToBase64(ev.data) }
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload })
      })
      ws.addEventListener('error', () =>
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'websocket error' }),
      )
      ws.addEventListener('close', (ev) => {
        sockets.delete(msg.connId)
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
