# Feature PRD — Hardware Connectivity

**Status:** in progress — Phase 1 shipped (comms layer #106, manual divergence harness #107) and the Phase 2 capability spike landed (#108); the UI arc (Phases 2–3) remains ungreenlit, with the bytecode-push go/no-go open (#112)
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Supersedes:** the main PRD's deferred "Hardware upload" bullet (Deferred → Hardware upload)
**Related:** `Feature - Hardware-Fidelity Preview & ShaderToy Porting.md` (this feature unblocks its divergence harness); ADR-0002 (main-thread execution); **ADR-0004 (to be written) — local bridge for hardware connectivity**

---

## Summary

This feature connects the IDE to a **real Pixelblaze controller** over its WebSocket API, so that the IDE can do what no offline preview can: read and write live device state, and (eventually) push patterns to hardware. The immediate, urgent reason to build it now is **validation**: the hardware-fidelity feature specifies a *divergence harness* that characterises firmware built-ins against a real device, and that harness has no transport yet. This feature supplies it.

It is sequenced as **validate → discover → decide UI**, deliberately refusing to design UI on top of capabilities we have not proven exist:

1. **Phase 1 — Comms layer + manual divergence harness.** A minimal, documented-API-only connection layer and the harness that finishes the fidelity work. **Committed; build now.**
2. **Phase 2 — Capability exploration spike.** Tests and exploratory code to discover how far the protocol actually goes — especially the *undocumented* pattern-push path — producing a committed capability report. **The gate that decides whether the UI arc is worth building.**
3. **Phase 3+ — Local bridge + IDE integration (UI).** Deferred and undesigned. Recorded here as vision and open questions, scoped only after Phase 2.

Phase 1 is small and self-contained. Phases 2–3 are a large arc that is **captured but not greenlit**.

---

## Goals

- **Unblock fidelity validation.** Make the divergence harness real: drive a physical controller, sweep inputs, read outputs, and commit a per-built-in divergence report.
- **Build the connection layer once, reuse it everywhere.** One framework-free, transport-agnostic module that serves the Node harness today and a local bridge later — no duplicated protocol code.
- **Learn before committing.** Establish empirically (Phase 2) what the controller's WebSocket API can and cannot do — particularly pattern push — before any UI is designed.

## Non-goals

- **No UI in Phases 1–2.** No connection panel, no controller list, no live-push button. The browser is not involved until the bridge phase.
- **No automated pattern push in Phase 1.** The probe pattern is hand-loaded via the stock ElectroMage editor (see Phase 1). Automated push is a Phase 2 research target, not a Phase 1 dependency.
- **No network discovery in Phase 1.** The device IP is hardcoded. Discovery is deferred (see Background).
- **No hosted/cloud bridge.** A bridge must run on the LAN to see a `192.168.x.x` controller; a cloud server cannot. The bridge, when built, is always local.
- **No change to the offline guarantee for authoring.** Writing, transpiling, previewing (with fidelity), downloading, and copying patterns remain 100% browser-only and require nothing installed. Hardware connectivity is purely additive.

---

## Background: why the browser can't talk to the device, and what that forces

The IDE deploys to **GitHub Pages (https)**. A Pixelblaze speaks only **`ws://` on port 81** — it has no TLS, so there is no `wss://`. This produces a hard constraint that shapes the entire feature:

- **Mixed content is a hard wall.** An https page opening `ws://192.168.x.x:81` is mixed *active* content and is blocked outright — no prompt, no API-level override (only a per-site "allow insecure content" toggle the user must set by hand: fragile, security-weakening, not a foundation).
- **CORS is *not* a wall for the socket.** WebSockets don't use CORS/same-origin; the cross-origin handshake to the device is fine at the protocol level. CORS *does* block the discovery HTTP endpoint (below).
- **Local Network Access (Chrome 142/147+)** adds a permission *prompt* for public→private/localhost requests — survivable, unlike mixed content.

**Consequence — the connection layer must run in Node, not the browser.** This is not a fallback; from a GitHub-Pages deployment the browser was never going to reach a `ws://` device. The Node layer is *the* device transport in every phase:

- **Phase 1:** a Node test/harness process drives it directly (no sandbox, `ws://` and HTTP both work freely).
- **Phase 3+:** a **local bridge** process wraps the same module in a tiny `ws://127.0.0.1` server. `localhost` is a "potentially trustworthy" origin and is *exempt from mixed-content blocking*, so the https IDE can reach the bridge; the bridge reaches the device. (See ADR-0004, to be written — this reverses the main PRD's "no backend, no network" promise for hardware features and is the kind of decision a future reader will question.)

### Discovery (deferred)

`GET https://discover.electromage.com/discover` is an open, unauthenticated JSON endpoint that matches controllers by the caller's **public IP** and returns each one's `localIp`:

```json
[{"id":"pixelblaze_pb32_…","name":"…","boardType":"pb32",
  "ip":"<public>","localIp":"192.168.x.x","version":"3.67","createdAt":"…"}]
```

It is **not usable from the browser**: it sends no `Access-Control-Allow-Origin`, so a cross-origin fetch is blocked. It works fine from Node. Discovery therefore belongs to the bridge (or is replaced by manual IP entry). Pixelblaze v2.10+ also emit UDP broadcast beacons (how Firestorm discovers devices), which only a LAN-resident process can hear — another reason discovery lives in the bridge, never the browser. **Phase 1 sidesteps all of this with a hardcoded IP.**

---

## Phase 1 — Comms layer + manual divergence harness  *(committed; build now)*

### Connection layer

`src/engine/PixelblazeConnection.ts` — framework-free, zero React imports, consistent with the engine/UI boundary and the injectable-shim pattern (`builtins.ts`):

- **Isomorphic via an injected WebSocket factory.** The browser would pass native `WebSocket`; Node passes `ws`. The module knows nothing about its host environment.
- Connect to `ws://<host>:81`; send/receive JSON text frames.
- **Request/response correlation** — e.g. `getVars` → `{vars: …}` resolves a pending promise.
- Ping keepalive; lifecycle events (open / close / error).
- Binary-frame decode (`listPrograms`) only if the harness needs it; otherwise it slips to Phase 2.

### The divergence harness

Per the fidelity PRD, the harness characterises firmware built-ins numerically against a real device:

- **Hardcoded device IP** (no discovery).
- **Probe pattern is hand-loaded once**, via the stock ElectroMage editor — *not* pushed by the IDE. It writes a computed value into an exported var at a sentinel pixel index (`if (index == PROBE) probe = f(x)`). This keeps Phase 1 entirely within the *documented* API (`getVars`/`setVars`, optionally `activeProgramId`) and free of the undocumented push protocol.
- The harness sweeps inputs via `setVars`, reads results via `getVars`, and computes per-built-in divergence (max |Δ|) against the preview.
- **Deliverable:** the committed divergence report the fidelity PRD calls for, under `test/divergence-harness/`.

### Testing (two tiers)

A live device is unreachable from `npm test` / the pre-commit hook, so:

1. **Unit tier (in the commit gate):** `PixelblazeConnection` tested against a **fake in-memory WebSocket** injected via the factory — framing, request/response correlation, lifecycle, and any binary decode. No network.
2. **Live tier (out-of-band, manual):** the harness (`npm run harness` or similar) hits the real device at the hardcoded IP and writes the committed report. **Excluded from the pre-commit gate.**

### Ownership boundary with the fidelity feature

This PRD owns the **transport and harness machinery**. The fidelity PRD owns **what to probe and the divergence conclusions**. The committed report lives where the fidelity PRD expects it. Both PRDs cross-reference.

---

## Phase 2 — Capability exploration spike  *(gate for the UI arc)*

Tests + exploratory code on the same isomorphic `PixelblazeConnection` (still under Node) to establish empirically what the protocol supports before any UI is designed:

- **Pattern push / save** — the headline unknown. The documented API covers `getVars`/`setVars`/`listPrograms`/`activeProgramId`/`brightness`/`get`+`setControls`, but **says nothing about how to upload or save a pattern.** This is an undocumented chunked **binary** protocol (`putSourceCode`/`saveProgram`), known only via reverse-engineering in `pixelblaze-client`. Whether the IDE can reliably push the transpiled artifact is *the* question that decides the feature's value — hence its own spike.
- `listPrograms` binary-frame decode (multi-frame concatenation, `0x07` header, start/end flags).
- `getControls`/`setControls` (with and without `save`), `brightness`, `activeProgramId` round-trips.
- Persistence behaviour and flash-wear caveats.
- **Deliverable:** a **committed capability report** — what works, what's flaky, what's undocumented-and-risky — in the evidence-first style of the divergence report. This report gates Phase 3.

---

## Phase 3+ — Local bridge + IDE integration  *(deferred; vision only)*

Not designed. Recorded as direction:

- **Local bridge** — a small Node process the user runs (à la Firestorm). IDE ↔ bridge over `ws://127.0.0.1`; bridge ↔ controller over `ws://LAN:81`; bridge also does discovery (cloud `/discover` and/or UDP beacons). Optional, local-only, additive. The web page never launches it — the user runs it and the IDE *detects* it.
- **IDE integration (UI)** — paradigm undecided (see Open questions).

### Open questions (captured, not yet decided)

- **IDE paradigm once connected.** What do users actually do — live-push the open pattern? Mirror controls/vars to the device and watch them? Read and browse the device's pattern list? How does this differ from the on-device ElectroMage editor? (User has signalled this is the least-understood part and wants it deferred until Phase 2 proves what's possible.)
- **Multiple controllers.** Typically one, occasionally several. List/select model; per-controller connection state.
- **Pattern identity mapping.** IDE pattern identity (IndexedDB id) vs controller-assigned id (e.g. `7MuJmcy4FZbs9jGbB`); how push reconciles them.
- **Bridge security model.** Localhost server reachable by any visited origin → Origin all-listing (IDE origin + localhost), bind `127.0.0.1` only, optional pairing token; LNA prompt as an additional gate. DNS-rebinding mitigations.
- **Bridge distribution / install UX.** `npx` vs packaged tray app; "bridge detected" status in the IDE.
- **Discovery surfacing.** Cloud `/discover`, UDP beacons, or manual IP entry — and where in the bridge/IDE it lives.

---

## File / artifact layout

```
docs/
  prd/
    Feature - Hardware Connectivity.md          (this doc)
  adr/
    0004-local-bridge-hardware-connectivity.md  (to be written, bridge phase)
src/
  engine/
    PixelblazeConnection.ts                     (Phase 1; isomorphic, injectable WS factory)
    PixelblazeConnection.test.ts                (Phase 1; fake-WS unit tests, in the gate)
test/
  divergence-harness/                           (Phase 1; live harness + committed report)
  capability-report/                            (Phase 2; exploratory code + committed report)
bridge/                                          (Phase 3+; local bridge process)
```

---

## Risks & open questions

- **Undocumented pattern-push protocol** — the capability most fundamental to the feature's value is the one the API doesn't document. Mitigation: Phase 2 spike against `pixelblaze-client`'s reverse-engineering before any UI commitment; Phase 1 deliberately avoids it.
- **Browser can never reach the device directly** (mixed content) — forces the local bridge, which dents the main PRD's offline/no-backend stance. Mitigation: bridge is optional and additive; ADR-0004 records the trade-off.
- **Live tests can't run in CI/commit** — risk of the connection layer rotting untested. Mitigation: fake-WS unit tier in the gate; live tier run deliberately out-of-band.
- **Firmware/protocol drift** — the API is maintained by ElectroMage, not versioned for us; binary formats especially may change across firmware. Mitigation: capability report is dated and tied to a firmware version.
- **Scope creep** — this is becoming a large piece of the app. Mitigation: the validate→discover→decide sequencing keeps each phase independently valuable and lets the arc stop after Phase 1 or Phase 2 without waste.

---

## Build order

1. **Phase 1** — `PixelblazeConnection` (isomorphic, fake-WS unit tests) → divergence harness (hardcoded IP, hand-loaded probe, `getVars`/`setVars`) → committed divergence report. Finish the fidelity compatibility work on top of it.
2. **Phase 2** — capability spike, especially pattern push/save → committed capability report. **Decision point: is the UI arc worth building?**
3. **Phase 3+** — only if Phase 2 says yes: local bridge, then IDE integration (paradigm resolved first).
