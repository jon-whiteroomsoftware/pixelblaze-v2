# Extension reaches Controllers via per-IP just-in-time optional host permissions

**Status:** accepted — lockdown for Chrome Web Store submission (#229). Refines the transport packaging in [ADR-0014](0014-controller-via-extension-relay.md); the provider seam and relay are unchanged.

## Context

The extension (ADR-0014) needs to open `ws://<LAN-IP>:81` and `http://<LAN-IP>/…` (compiler fetch #202, `/pixelmap.dat` read-back #205) to arbitrary, runtime-discovered device IPs. Today the manifest grabs this statically and broadly:

```json
"host_permissions": ["ws://*/*", "http://*/*", "https://discover.electromage.com/*"]
```

Automated Chrome Web Store scanners flag mandatory `ws://*/*` + `http://*/*` as a network-sniffing / MITM surface, which means a slow manual review and likely rejection. We want the extension to pass review.

Two hard platform facts shaped the decision:

- **Match patterns cannot express "the local network."** No CIDR, no partial octets (`http://192.168.*/*` is rejected), no `local-network` token. The only host scoping available is *exact origins*. So there is no static narrowing that still reaches arbitrary LAN devices.
- **`chrome.permissions.request` is unavailable to content scripts and needs a user gesture, which the service worker never has after an async message hop.** The only context that can request a permission is an extension-owned page (popup/options). This makes the "elegant in-page Connect → native prompt" flow impossible; the gesture must live in extension UI.

## Decision

**Move the LAN reach to `optional_host_permissions` and grant it per device IP, just-in-time, from the extension's action popup.**

```json
"host_permissions": ["https://discover.electromage.com/*"],
"optional_host_permissions": ["http://*/*", "ws://*/*"]
```

- Discovery (`discover.electromage.com`, #206) stays **required** — it must work before any device IP is known.
- When the app initiates a connection to an IP not yet granted, the service worker auto-opens the popup (`chrome.action.openPopup()`, no longer gesture-gated) and the popup calls `chrome.permissions.request({ origins: ['http://<ip>/*', 'ws://<ip>/*'] })`. Chrome's native "Allow access to `<ip>`?" dialog is the actual grant.
- **Discovery batches:** the popup requests all discovered devices' IPs in one `request([...])` call, so onboarding a fleet is a single grant + single native dialog.
- The grant gates **every** device-bound call (connect, compile fetch, `/pixelmap.dat`), not just the websocket — they all hit `http://<ip>`.
- **DHCP re-grant:** the reconnect path must distinguish "socket failed" from "permission missing for this (new) IP" and re-trigger the popup, rather than silently retry-failing.

## Considered options

- **One-time broad optional grant at onboarding (`http://*/*` once)** — smoothest UX (in-page Connect stays elegant forever, zero per-device prompts) and forward-compatible with sideloading. Rejected as the primary path because per-IP is strictly least-privilege and gives the **best odds of passing review**, which is the entire goal of #229. In steady state (same 2–3 devices, static IPs) per-IP has *zero* ongoing friction anyway; it only charges on new IPs and DHCP changes, which `openPopup` + batch-grant make cheap and in-context. Kept as the fallback to relax to if reviewers reject even the optional broad pattern.
- **Per-subnet scoping** — not expressible in match patterns (see Context).
- **Keep broad required `host_permissions`** — the status quo; rejected as the thing that triggers the review friction.
- **Skip the Web Store, sideload only** — viable fallback (the same build loads unpacked), but sideloading is a real context-switch for users (download files, enable developer mode, no auto-updates, startup nag). Preferred to keep store distribution if review allows.

## Consequences

- The build is **distribution-agnostic**: the identical manifest works from the Web Store or loaded unpacked, so a review rejection costs no rework — we either relax to the one-time-broad fallback or ship the same artifact as a documented sideload.
- New surface: a minimal **action popup** (grant UI + a natural home for helper/connection status) and a relay round-trip so the page can detect a missing grant and message the user.
- `openPopup()` reliability is Chrome-version-sensitive; the fallback when it no-ops is an in-app "click the extension icon" hint. Verify on hardware.
- Unrelated lockdown items ride along in #229 (drop `<all_urls>` from `web_accessible_resources`, narrow the content-script `matches` to the real deploy origin, message-origin hardening) but are not part of this decision.
