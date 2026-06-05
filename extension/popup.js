// Action popup for the PXLBLZ-IDE Controller Helper (#229, ADR-0015).
//
// The ONLY context that may call chrome.permissions.request: content scripts
// can't, and the service worker has no user gesture after an async hop. So the
// per-IP LAN grant is requested here, inside the popup's own click activation.
//
// The service worker auto-opens this popup (chrome.action.openPopup) when the
// app targets an un-granted device IP, and remembers which IP(s) are pending.
// We read that list, let the user grant them in one native dialog, and the SW
// notices the grant via chrome.permissions.onAdded and unblocks the queued call.

const HELPER = 'helper-popup'

// Parse the device IP out of one of our optional origins (http://IP/* | ws://IP/*).
function ipFromOrigin(origin) {
  const m = /^(?:https?|wss?):\/\/([^/]+)\//.exec(origin)
  return m ? m[1] : null
}

// The host wildcards themselves aren't device grants; hide them from the list.
function isDeviceOrigin(origin) {
  const ip = ipFromOrigin(origin)
  return ip && ip !== '*' && !origin.includes('electromage.com')
}

async function grantedIps() {
  const all = await chrome.permissions.getAll()
  const ips = new Set()
  for (const o of all.origins || []) {
    if (isDeviceOrigin(o)) ips.add(ipFromOrigin(o))
  }
  return [...ips]
}

async function getPendingIps() {
  try {
    const reply = await chrome.runtime.sendMessage({ target: HELPER, type: 'get-pending' })
    return (reply && reply.ips) || []
  } catch {
    return []
  }
}

function originsForIps(ips) {
  return ips.flatMap((ip) => [`http://${ip}/*`, `ws://${ip}/*`])
}

function el(tag, props, ...children) {
  const node = Object.assign(document.createElement(tag), props)
  for (const c of children) node.append(c)
  return node
}

async function render() {
  const root = document.getElementById('root')
  const [pending, granted] = await Promise.all([getPendingIps(), grantedIps()])
  // Only show IPs that still need a grant.
  const needed = pending.filter((ip) => !granted.includes(ip))
  root.replaceChildren()

  if (needed.length) {
    const label =
      needed.length === 1
        ? `Authorize the helper to reach this controller:`
        : `Authorize the helper to reach these controllers:`
    root.append(el('div', { className: 'label', textContent: label }))
    for (const ip of needed) root.append(el('span', { className: 'ip', textContent: ip }))

    const grant = el('button', { textContent: needed.length === 1 ? 'Grant access' : 'Grant access to all' })
    grant.addEventListener('click', async () => {
      grant.disabled = true
      let ok = false
      try {
        ok = await chrome.permissions.request({ origins: originsForIps(needed) })
      } catch {
        ok = false
      }
      // Tell the SW the outcome so it can unblock or fail the queued call promptly
      // (onAdded covers the grant; this also reports an explicit denial).
      chrome.runtime.sendMessage({ target: HELPER, type: 'grant-outcome', granted: ok }).catch(() => {})
      if (ok) window.close()
      else render()
    })
    root.append(grant)

    const deny = el('button', {
      textContent: 'Not now',
      style: 'background:transparent;color:var(--muted);',
    })
    deny.addEventListener('click', () => {
      chrome.runtime.sendMessage({ target: HELPER, type: 'grant-outcome', granted: false }).catch(() => {})
      window.close()
    })
    root.append(deny)
    return
  }

  // No pending request — show status (the granted fleet).
  root.append(el('div', { className: 'label', textContent: 'Authorized controllers' }))
  if (granted.length) {
    const list = el('ul', {})
    for (const ip of granted.sort()) list.append(el('li', { className: 'ok', textContent: ip }))
    root.append(list)
  } else {
    root.append(el('div', { className: 'empty', textContent: 'None yet. Connect from the app to authorize one.' }))
  }
}

render()
