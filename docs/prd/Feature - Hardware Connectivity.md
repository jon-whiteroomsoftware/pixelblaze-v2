# Feature PRD — Hardware Connectivity

**Status:** **Phases 1–2 shipped** — the isomorphic comms layer + manual divergence harness (#106/#107) and the Phase 2 capability spike, including the undocumented binary pattern-push path (#108/#112), are in. The **UI arc (Phase 3) remains deferred and undesigned.** For *how the shipped layer works* see **`docs/PXLBLZ Technical Reference.md`** §13. This PRD is retained for the **why** — the hard browser→device constraint that shapes the whole feature — and the Phase 3 vision + open questions.
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Supersedes:** the main PRD's deferred "Hardware upload" bullet
**Related:** ADR-0003 + `docs/PXLBLZ Technical Reference.md` §2/§5 (the hardware-fidelity engine — this feature unblocked its divergence harness); ADR-0002 (main-thread execution); **ADR-0004 (local bridge for hardware connectivity — to be written when Phase 3 is greenlit)**

---

## Summary

This feature connects the IDE to a **real Pixelblaze controller** over its WebSocket API, so the IDE can do what no offline preview can: read and write live device state, and (eventually) push patterns to hardware. The immediate reason it was built now was **validation** — the hardware-fidelity feature's divergence harness needed a transport, and this supplied it.

It is sequenced as **validate → discover → decide UI**, deliberately refusing to design UI on top of capabilities not yet proven to exist:

1. **Phase 1 — Comms layer + manual divergence harness.** **Shipped.**
2. **Phase 2 — Capability exploration spike.** **Shipped** — established empirically how far the protocol goes, including the *undocumented* binary pattern-push path; the committed capability report records a bytecode-push GO on a proven path (#112).
3. **Phase 3+ — Local bridge + IDE integration (UI).** **Deferred and undesigned.** Recorded below as vision and open questions.

The shipped transport — the framework-free, isomorphic `PixelblazeConnection` (injected WebSocket factory: browser `WebSocket` or Node `ws`), the documented JSON API, the binary-frame protocol, and both committed reports — is described in `docs/PXLBLZ Technical Reference.md` §13.

---

## Goals

- **Unblock fidelity validation.** Make the divergence harness real: drive a physical controller, sweep inputs, read outputs, commit a per-built-in divergence report. *(Done.)*
- **Build the connection layer once, reuse it everywhere.** One framework-free, transport-agnostic module that serves the Node harness today and a local bridge later — no duplicated protocol code. *(Done.)*
- **Learn before committing.** Establish empirically what the controller's WebSocket API can and cannot do — particularly pattern push — before any UI is designed. *(Done — Phase 2 capability report.)*

## Non-goals

- **No hosted/cloud bridge.** A bridge must run on the LAN to see a `192.168.x.x` controller; a cloud server cannot. The bridge, when built, is always local.
- **No change to the offline guarantee for authoring.** Writing, transpiling, previewing (with fidelity), downloading, and copying patterns remain 100% browser-only and require nothing installed. Hardware connectivity is purely additive.

---

## Background: why the browser can't talk to the device, and what that forces

This is the constraint that shapes the entire feature. The IDE deploys to **GitHub Pages (https)**; a Pixelblaze speaks only **`ws://` on port 81** (no TLS, so no `wss://`). Therefore:

- **Mixed content is a hard wall.** An https page opening `ws://192.168.x.x:81` is mixed *active* content and is blocked outright — no prompt, no API-level override (only a per-site "allow insecure content" toggle the user sets by hand: fragile, not a foundation).
- **CORS is *not* a wall for the socket.** WebSockets don't use CORS; the cross-origin handshake to the device is fine at the protocol level. CORS *does* block the discovery HTTP endpoint.
- **Local Network Access (Chrome 142/147+)** adds a permission *prompt* for public→private/localhost requests — survivable, unlike mixed content.

**Consequence — the connection layer must run in Node, not the browser.** This is not a fallback; from a GitHub-Pages deployment the browser was never going to reach a `ws://` device. The Node layer is *the* device transport in every phase: Phase 1 a Node test/harness process drives it directly; Phase 3+ a **local bridge** process wraps the same module in a tiny `ws://127.0.0.1` server (`localhost` is "potentially trustworthy" and exempt from mixed-content blocking, so the https IDE can reach the bridge; the bridge reaches the device). ADR-0004 will record that this reverses the main PRD's "no backend" promise for hardware features.

**Discovery (deferred to the bridge).** `GET https://discover.electromage.com/discover` matches controllers by the caller's public IP and returns each one's `localIp`, but sends no `Access-Control-Allow-Origin` so it is unusable from the browser (fine from Node). Pixelblaze v2.10+ also emit UDP broadcast beacons only a LAN-resident process can hear. Discovery therefore belongs to the bridge (or is replaced by manual IP entry) — the shipped phases sidestep it with a hardcoded IP.

---

## Phase 3+ — Local bridge + IDE integration *(deferred; vision only)*

Not designed. Recorded as direction:

- **Local bridge** — a small Node process the user runs (à la Firestorm). IDE ↔ bridge over `ws://127.0.0.1`; bridge ↔ controller over `ws://LAN:81`; bridge also does discovery (cloud `/discover` and/or UDP beacons). Optional, local-only, additive. The web page never launches it — the user runs it and the IDE *detects* it.
- **IDE integration (UI)** — paradigm undecided (see Open questions).
- **Pixel-map push / pull** *(rehomed from the retired Pixel Maps feature PRD; the offline map model it rode on has shipped — `docs/PXLBLZ Technical Reference.md` §8)*. Make a workspace map deployable to, and readable from, a real device, as a **deliberate device-configuration action — never part of routine pattern deploy**. On hardware a Pixelblaze stores **one map per device**, shared by every pattern and set once when the installation is built; so overwriting it with a preview default is destructive and must be explicit and guarded.
  - **Push** — write a selected map to the device's single map slot. Guarded and explicit, framed as "this configures the *installation*, not the pattern."
  - **Pull / read-back** — import the device's current map into the IDE so the preview reflects what's actually deployed. The safer, more useful first direction.
  - **Transport** — reuses `PixelblazeConnection` and the same local bridge; no new transport. Map read/write protocol support is a capability to confirm in the Phase 2 spike's spirit (the binary-frame work, `docs/PXLBLZ Technical Reference.md` §13) before any UI.

### Open questions (captured, not yet decided)

- **IDE paradigm once connected.** What do users actually do — live-push the open pattern? Mirror controls/vars to the device and watch them? Read and browse the device's pattern list? How does this differ from the on-device ElectroMage editor? (Signalled as the least-understood part, deferred until the capability spike proved what's possible — which it now has.)
- **Multiple controllers.** Typically one, occasionally several. List/select model; per-controller connection state.
- **Pattern identity mapping.** IDE pattern identity (IndexedDB id) vs controller-assigned id; how push reconciles them.
- **Bridge security model.** Localhost server reachable by any visited origin → Origin allow-listing (IDE origin + localhost), bind `127.0.0.1` only, optional pairing token; LNA prompt as an additional gate. DNS-rebinding mitigations.
- **Bridge distribution / install UX.** `npx` vs packaged tray app; "bridge detected" status in the IDE.
- **Discovery surfacing.** Cloud `/discover`, UDP beacons, or manual IP entry — and where in the bridge/IDE it lives.

---

## Risks & open questions

- **Undocumented pattern-push protocol** — the capability most fundamental to the feature's value was the one the API doesn't document. *Resolved* by the Phase 2 spike against `pixelblaze-client`'s reverse-engineering; the capability report records a proven bytecode-push path (#112).
- **Browser can never reach the device directly** (mixed content) — forces the local bridge, which dents the main PRD's offline/no-backend stance. Mitigation: bridge is optional and additive; ADR-0004 will record the trade-off when Phase 3 is greenlit.
- **Live tests can't run in CI/commit** — the connection layer's live tier is excluded from the gate. Mitigation: fake-WS unit tier in the gate; live tier run deliberately out-of-band.
- **Firmware/protocol drift** — the API is maintained by ElectroMage, not versioned for us; binary formats especially may change across firmware. Mitigation: the capability report is dated and tied to a firmware version (fw 3.67).
