# H1 spike report (#193)

> Filled in after running against a real device. This file is the deliverable.

## Verdict

- **Go / No-go:** **GO** — from the deployed https page, the extension drove a full
  **write/read round-trip** over `ws://<LAN>:81`: it read the Controller's brightness, wrote
  new values (LEDs visibly dimmed then brightened), and read the value back to confirm. This
  exceeds the gate's read-only bar and de-risks the whole control path. The arc can package as
  a Chrome extension.
- **Date run:** 2026-06-03
- **Tester:** Jon Chester

## Environment

- **Chrome version:** 148.0.7778.179
- **OS:** macOS (Darwin 25.5.0)
- **Controller model / firmware:** Pixelblaze (model/firmware not recorded; discovered via the
  Pixelblaze Discovery Service and confirmed reachable from the Electromage IDE before the run)
- **Controller IP used:** 192.168.8.224
- **Network:** Same LAN subnet (192.168.8.x), no AP mode, no VPN.

## Result

- Did the https page drive a real read **and write** on the device through the extension?
  **Yes — a full write/read round-trip.** The test read the current brightness, wrote two new
  brightness values (the LEDs visibly dimmed to 1/3 then rose to 2/3), restored the original,
  and read it back to confirm.
- Verbatim console transcript:
  ```
  [H1 spike] starting write/read round-trip...
  [H1 spike] connected. getConfig frames: (3) [...] (brightness reads back as 0.045)
  [H1 spike] setting brightness -> 0.33 (watch the lights dim)...
  [H1 spike] setting brightness -> 0.66 (watch the lights brighten)...
  [H1 spike] restoring brightness -> 0.045...
  [H1 spike] OK -- write/read round-trip confirmed. brightness now reads 0.045.
  ```
- **Hardware confirmation:** the physical LEDs dimmed then brightened in step with the writes.
- **Programmatic confirmation:** brightness was read back via `getConfig` before (0.045) and
  after restore (0.045).
- An earlier read-only run (`{getVars:true}`) also passed, returning an empty-but-real `{}`
  (active pattern exports no vars), reproduced across two console contexts.

## Local Network Access (LNA)

- Did Chrome show an LNA / local-network permission prompt? **No — no prompt appeared at
  all**, neither at extension load nor at first connect. The relay worked immediately.
- Exact prompt wording: n/a (none shown).
- What was required to clear it: nothing.
- Any `chrome://flags` needed: none toggled for this run.
- Note for H3: this ran on a **current** Chrome (148.0.7778.179), so "no prompt" is a strong
  positive, not a stale-build artifact. Still, LNA enforcement is an active rollout and could
  begin prompting (or blocking) in a later version on this same setup. The provider should not
  assume "no prompt forever" — be ready to surface an allow flow if a future Chrome starts
  gating local-network access.

## Permissions / manifest notes

- `host_permissions` carried both the `ws://192.168.8.224/*` and `http://192.168.8.224/*`
  entries; the run succeeded with that pair. We did not attempt to narrow further (e.g. drop
  the `http://` entry) — worth a follow-up probe in #195 to find the minimal grant.
- Content-script relay (page `window.postMessage` <-> `chrome.runtime`): no friction. Chose it
  over `externally_connectable` to avoid the unstable unpacked-extension ID; that decision held
  up with zero ID juggling.

## Protocol findings (for #195)

- **Write:** `{ "brightness": 0..1 }` works live over the websocket exactly as documented
  (live-only, not saved to flash). Visible on the hardware.
- **Read-back:** `{ "getConfig": true }` is **undocumented but works** on this firmware — it
  returns a JSON frame containing `brightness` (and other config). The H3 provider can use it
  to read current brightness, but treat it as firmware-version-dependent and degrade gracefully
  if a future/older firmware omits it.
- `getConfig` returned **3 JSON frames** total in the collect window; brightness was found by
  scanning all frames for a numeric `brightness` field, not by assuming the first frame.

## MV3 service-worker lifecycle

- This spike opens a **fresh** socket per request. After leaving the tab **idle ~30s+** (long
  enough for the MV3 service worker to go idle/evict), a second request **still succeeded** —
  the worker woke on the `chrome.runtime.sendMessage` and the fresh socket connected fine.
- Open question for H3: a **long-lived** socket was not tested here. The evidence only shows
  that *reconnect-on-each-wake* is reliable. The productionized provider should either keep
  reconnecting per request (proven path) or, if it wants a persistent socket, separately verify
  that the socket survives worker eviction — do not assume it does.

## Surprises / gotchas

- Cleanest possible outcome: worked first try, no LNA prompt, idle-survival held. The main
  caveat is the LNA-rollout risk above — today's "no prompt" is not a guarantee for future
  Chrome builds.
- DevTools showed its standard "Don't paste code into the console" warning; required typing
  `allow pasting` once before the snippet would run. Cosmetic, not a spike finding.

## Implication for the arc

- **GO confirmed.** #194 (transport seam) + #195 (extension provider) proceed as written.
  #200 (compile-in-extension) stays in scope. No fallback to the Node bridge needed.
- Carry forward into #195: (1) probe the minimal `host_permissions` grant, (2) re-verify LNA
  behavior against current Chrome, (3) decide persistent vs reconnect-per-wake socket and
  verify whichever is chosen.
