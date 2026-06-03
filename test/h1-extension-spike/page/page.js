// Page-world script for the optional deployable test page. Talks only to the
// content-script relay via window.postMessage -- it never touches chrome.*.
// Runs the same brightness write/read round-trip as page/console-snippet.js.
const TAG_REQ = 'pbx-h1-spike/request'
const TAG_RES = 'pbx-h1-spike/response'
const TAG_PRESENT = 'pbx-h1-spike/present'
const TAG_PING = 'pbx-h1-spike/ping'

const presentEl = document.getElementById('present')
const readBtn = document.getElementById('read')
const statusEl = document.getElementById('status')
const outEl = document.getElementById('out')

// Send one Pixelblaze command through the relay and await the worker's reply.
const send = (command, collectMs = 700) =>
  new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const onReply = (event) => {
      if (event.source !== window) return
      const m = event.data
      if (!m || m.tag !== TAG_RES || m.id !== id) return
      window.removeEventListener('message', onReply)
      resolve(m)
    }
    window.addEventListener('message', onReply)
    window.postMessage({ tag: TAG_REQ, id, command, collectMs }, '*')
  })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const brightnessFrom = (frames) => {
  for (const f of frames ?? []) {
    if (f && typeof f.brightness === 'number') return f.brightness
  }
  return undefined
}

// Presence handshake (the content script's broadcast fires before we load).
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const m = event.data
  if (m && m.tag === TAG_PRESENT) {
    presentEl.textContent = 'yes'
    presentEl.className = 'ok'
    readBtn.disabled = false
  }
})
window.postMessage({ tag: TAG_PING }, '*')

const log = (line) => {
  outEl.textContent += line + '\n'
}

readBtn.addEventListener('click', async () => {
  readBtn.disabled = true
  outEl.textContent = ''
  statusEl.textContent = 'running round-trip... (watch the lights, and for an LNA prompt)'
  statusEl.className = ''

  const before = await send({ getConfig: true }, 900)
  if (!before.ok) {
    statusEl.textContent = 'FAILED'
    statusEl.className = 'err'
    log('getConfig failed: ' + before.error)
    readBtn.disabled = false
    return
  }
  const original = brightnessFrom(before.frames)
  log('connected; brightness reads back as: ' + (original ?? '(not reported)'))

  log('dimming to 0.33...')
  await send({ brightness: 0.33 }, 300)
  await sleep(2000)

  log('raising to 0.66...')
  await send({ brightness: 0.66 }, 300)
  await sleep(2000)

  const restoreTo = original ?? 1
  log('restoring to ' + restoreTo + '...')
  await send({ brightness: restoreTo }, 300)
  await sleep(500)

  const after = await send({ getConfig: true }, 900)
  const confirmed = brightnessFrom(after.frames)
  statusEl.textContent = 'OK -- round-trip complete'
  statusEl.className = 'ok'
  log(
    confirmed !== undefined
      ? 'confirmed: brightness now reads ' + confirmed
      : 'writes sent across the bridge; confirm visually that the LEDs dimmed and brightened',
  )
  readBtn.disabled = false
})
