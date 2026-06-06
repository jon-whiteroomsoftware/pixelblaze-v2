# Chrome Web Store submission paperwork

Reviewer-facing copy for the **PXLBLZ-IDE Controller Helper** listing (issue #234,
follow-up to the #229 / ADR-0015 lockdown). The extension code is frozen; this file
is the text to paste into the Web Store developer dashboard at submission time. Keep
it in sync with `extension/manifest.json`.

The decision rationale behind every permission below lives in the Technical Reference
(§"The extension backend" / "Per-IP just-in-time host permissions" / "Auto-discovery")
and the retired ADR-0015 (`git show 106ec4c^:docs/adr/0015-extension-host-permissions-jit-per-ip.md`).

---

## Privacy policy URL

> https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/privacy.html

Source: `public/privacy.html` (deployed to GitHub Pages with the app). States the
extension collects/transmits no user data; controller traffic is relayed locally and
never sent anywhere; the one off-LAN request is the user-triggered cloud discovery
call to Electromage.

## Single purpose

> The extension's single purpose is to relay local-network WebSocket and HTTP traffic
> between the PXLBLZ-IDE web app and the user's Pixelblaze LED controllers, which a
> secure (HTTPS) web page cannot reach directly.

## Data-use disclosures (dashboard checkboxes)

- Does **not** collect or use any of the listed user-data categories.
- I certify: data is **not** sold to third parties; **not** used or transferred for
  purposes unrelated to the single purpose; **not** used to determine creditworthiness
  or for lending.

---

## Permission justifications

Paste each into the matching "why do you need this?" box.

### `offscreen`

> Pattern compilation runs the controller's own compiler, which requires `eval`.
> Under Manifest V3 `eval` is only permitted inside a sandboxed iframe, and a service
> worker cannot host an iframe. The `offscreen` permission creates the minimal hidden
> document needed to host that sandboxed iframe. It is used for nothing else.

### `optional_host_permissions` -> `http://*/*` and `ws://*/*`

> These are **optional**, never granted on install. They are requested at runtime, one
> controller IP address at a time, only when the user chooses to connect to that
> controller, via Chrome's native per-site permission prompt. A per-IP grant is the
> tightest scoping Chrome match patterns allow for a local device, because match
> patterns cannot express "the local network" (no CIDR and no partial octets, so
> `http://192.168.*.*/*` is rejected). The grant is used solely to relay that one
> controller's traffic: open its `ws://<ip>:81` socket, fetch its compiler from
> `http://<ip>/index.html.gz`, and read its pixel map from `http://<ip>/pixelmap.dat`.
> No data is collected and nothing is sent off the local network.

### Host permission -> `https://discover.electromage.com/*`

> Required because device discovery must work before any controller IP is known.
> When the user opens the discovery control, the extension makes a single HTTPS GET to
> `discover.electromage.com/discover` &mdash; the controller manufacturer's official
> cloud discovery service &mdash; which returns the local IP addresses of the user's
> own controllers. This is the only viable discovery path: a Manifest V3 extension has
> no raw UDP socket, so the controllers' native LAN UDP beacon cannot be used. The web
> page itself cannot read this endpoint (no CORS header), so the extension makes the
> request. No user data is sent; the service matches devices by the network's public IP.

### `'unsafe-eval'` in the sandbox CSP

> Scoped to the sandboxed iframe only (`content_security_policy.sandbox`), never to the
> extension or service worker. Compiling a pattern means running the **controller's own
> compiler** &mdash; JavaScript downloaded from the user's controller over the local
> network &mdash; to turn pattern source into device bytecode. That requires `eval`, and
> Manifest V3 only permits `eval` inside a sandboxed iframe. No remote code is loaded
> from any server we operate; the only code evaluated is the firmware's own compiler
> fetched from the user's device.

---

## Listing metadata sanity pass

Check before submitting:

- [ ] `manifest.json` `version` matches the build being uploaded (currently `1.0.0`).
- [ ] `manifest.json` `name`, `description`, `homepage_url`, `author` match the listing.
- [ ] `minimum_chrome_version` (`127`) is correct &mdash; it gates on programmatic
      `chrome.action.openPopup()` (Chrome 127), above `getContexts` (116) and
      `offscreen` (109).
- [ ] Icons present at 16 / 48 / 128 (`extension/icons/`).
- [ ] Content-script `matches` list only the real deploy origins (github.io + localhost
      dev) &mdash; no `<all_urls>`.
- [ ] No `web_accessible_resources` (dropped in #229).
- [ ] Required `host_permissions` is **only** `discover.electromage.com`; LAN reach is in
      `optional_host_permissions`.
- [ ] Privacy policy URL above resolves (deploy `public/privacy.html` first).
- [ ] Store description matches the single-purpose statement; screenshots show the relay
      in use (connect + live panel), not unrelated app features.

## Store description (draft)

> Connect the PXLBLZ-IDE pattern editor to your Pixelblaze LED controllers.
>
> PXLBLZ-IDE runs in your browser over HTTPS, but Pixelblaze controllers speak plain
> WebSocket on your local network, which a secure web page can't reach on its own. This
> helper bridges that gap: it relays the controller's traffic so you can compile
> patterns, push them to the device, adjust controls and brightness, and read back the
> pixel map &mdash; all live.
>
> - No account, no analytics, no data collection.
> - Controller traffic stays on your local network.
> - Access to each controller is requested per device, only when you connect, and
>   scoped to that one device's address.
> - Optional device discovery uses Pixelblaze's official cloud finder.
