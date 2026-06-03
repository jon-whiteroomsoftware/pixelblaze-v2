# Hardware Connectivity (Phase 3) - Issue Plan

Phased implementation plan for connecting the IDE to a live Controller, derived from
the design conversation of 2026-06-02. Companion to `Feature - Hardware Connectivity.md`
(the why) and `PXLBLZ Technical Reference.md` §13 (the shipped comms layer). New canonical
terms (**Controller panel**, **Send to Controller**) are in `CONTEXT.md`.

**Tracker:** epic [#208](https://github.com/jon-whiteroomsoftware/pixelblaze-v2/issues/208).
H1=#193, H2=#194, H3=#195, H4=#196, H5=#197, H6=#198, H7=#199, H8=#200, H9=#201,
H10=#202, H11=#203, H12=#204, H13=#205, H14=#206, H15=#207.

## Design decisions locked in this plan

- **Lens.** Hardware connectivity serves the *authoring loop* (validate, push, monitor,
  tune), not installation management. "Deploy the open pattern and watch it" is in;
  "orchestrate the installation" (playlists, sync groups, scheduling) is out.
- **Model A.** The **Controller panel** mirrors the *live truth* of the Controller; it is
  not a second editor. Linked to the editor only by **Send to Controller**.
- **Send to Controller.** One verb; runs *and* stores; overwrite-in-place via a
  per-Controller binding (no copy pile-up). Payload = **pattern (always) + map
  (opt-in, guarded)**; nothing else from the preview rides along (not brightness, fit,
  pixel count, speed, light size, diffusion, solidity, fidelity, layout, or tuned
  control values). Gated on connected + dimensionality match.
- **Brightness** is a live, volatile, **Controller-panel-only** control - never inherited
  from the preview (real LEDs are far brighter than a monitor).
- **Preflight v1 warnings**: pixel-count fit (both directions) + map-overwrite guard.
  Map-mismatch warning deferred (needs map read-back, an unconfirmed capability).
- **Discovery v1**: manual IP entry, remembered. Cloud/UDP discovery deferred and lives
  in the helper anyway.
- **Helper packaging**: target a **Chrome extension** (friendlier than a Node server),
  with the existing Node `PixelblazeConnection` as the proven fallback. The extension
  route is *unproven* and must be de-risked first.

## Containment

The extension assumption is firewalled behind the **transport-provider seam** (H2). Each
issue below is tagged:

- **[transport-coupled]** - carries the extension assumption; rewritten/replaced if the
  extension route fails (fall back to the Node bridge). These are **H1, H3, H8, H13**.
- **[transport-agnostic]** - written against the provider interface; survives a bridge
  fallback unchanged. Everything else.

If the extension fails the H1 gate, only H3 (extension provider) is swapped for a
Node-bridge provider and H8 (compiler-in-extension) is mooted; no product issue changes.

---

## Phase 0 - De-risk the transport (the gate)

### H1. SPIKE: can a Chrome extension relay `ws://LAN` to the https page? [transport-coupled]
**Label:** ready-for-human · **Blocks:** everything

The single go/no-go for the whole packaging. Cheapest possible test, no product code.

- Minimal MV3 extension: hardcoded Controller IP, no UI, no storage.
- Background/service-worker (or offscreen doc) opens `ws://<ip>:81`, sends `{"getVars":true}`,
  receives the reply.
- A trivial page on the deployed **https** origin (github.io) messages the extension
  (`externally_connectable` / content-script relay) and logs the value the device returned.
- **Acceptance:** a value read from a *real device* appears in the https page's console,
  through the extension, including clearing any Chrome **Local Network Access** prompt.
- **Record:** does it work on current Chrome? What permissions/prompts are required? Note
  any MV3 service-worker lifecycle gotchas (socket dies on worker idle?).

If this fails: stop, fall back to the Node bridge packaging for H3, keep all else.

---

## Phase 1 - Connection plumbing (the firewall)

### H2. Transport-provider seam: one interface, swappable backends [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H1 (go)

App-side `ControllerProvider` interface over the existing isomorphic `PixelblazeConnection`:
connect/disconnect, helper-present detection, JSON read/control surface (`getConfig`,
`listPrograms`, `setControls`, `brightness`), and a capability flag for push/compile. The
app imports *only this interface*. Extension vs bridge is one implementation choice. This
is the containment boundary - keep all packaging specifics out of it.

### H3. Chrome-extension provider implementation [transport-coupled]
**Label:** ready-for-human · **Depends:** H1, H2

Productionize the H1 spike into the v1 provider: MV3 manifest + host permissions,
page<->extension handshake ("extension installed?"), manual IP entry + remembered binding,
connection lifecycle/status, reconnect. Implements the H2 interface. (Swapped for a
Node-bridge provider if H1 fails.)

### H4. Connection status in the nav [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H2

Top-right Controller icon with states: no-helper / helper-present-no-Controller /
connecting / connected (+ which Controller). Reads provider state only.

---

## Phase 2 - Controller panel (read / monitor, Model A)

### H5. Controller panel shell + multi-Controller select [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H4

Icon -> dropdown/popover. Lists Controllers (optimize the single-Controller case; support N).
Per-Controller connection state. Empty/absent with no helper.

### H6. Live mirror: active pattern, brightness, FPS [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H5

Polled read-only telemetry (active pattern name, reported FPS) + the live **brightness**
slider (volatile `setBrightness`, panel-only). Mind flash wear: never `save:true` on scrub.

### H7. Live mirror: controls + watched vars [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H5

Render the *running* pattern's controls (editable, volatile `setControls`) and watched
vars (read-only), reusing the preview deck's control widgets + var-watcher rendering.
Deferred (note in issue, do not build): switch active pattern, `setVars`, save-to-flash,
browse stored library - those cross into device-management.

---

## Phase 3 - Send to Controller (pattern push)

### H8. SPIKE: run ElectroMage's compiler inside the extension [transport-coupled]
**Label:** ready-for-human · **Depends:** H1 · **Blocks:** H10

Push needs bytecode (capability-spike path (a): fetch the device's compiler, run it in a
JS host). In the bridge that host was `node:vm`. In the extension it must run under MV3 CSP
(offscreen document / sandboxed iframe - no remote eval in the service worker). Confirm the
extension can fetch the compiler from the device and emit accepted bytecode. **Isolated
push-specific risk:** if it fails, push needs the Node bridge even if H1/read-control passed
- contained to push only; H5-H7 monitoring is unaffected.

### H9. "Send to Controller" button + gating [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H2

Editor-header action, enabled only when connected **and** dimensionality matches the
Controller's installed map. Disabled-state explains why.

### H10. Push pipeline: compile -> frame -> run, overwrite-in-place [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H8 (go), H9

`setCode`/`putByteCode`/unpause via the provider's compile+push capability. Per-Controller
binding in IndexedDB (create+bind first time, overwrite after, silent re-create if deleted
on device). Deliberate click only - no continuous sync.

### H11. Preflight dialog: pixel-count fit + map-overwrite guard [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H10

Reconciliation screen. Reads the Controller's fixed pixel count (`getConfig`). Warns:
map points < count ("only N of M pixels lit"), map points > count ("extras ignored"),
and - only if map push is opted into - "this replaces the Controller's single shared map."
Map-mismatch warning explicitly out (needs read-back; see H12/H14).

---

## Phase 4 - Map push (guarded) + later capability

### H12. Map push: write the baked map to the Controller [transport-agnostic]
**Label:** ready-for-agent · **Depends:** H11

Opt-in from the preflight: write the baked coordinate array to the device's single map slot,
framed as "configures the *installation*, not the pattern." Guarded + explicit.

### H13. SPIKE/CONFIRM: map read-back capability [transport-coupled]
**Label:** ready-for-human · **Depends:** H1

Confirm the protocol can *read* the Controller's current map (capability-spike spirit).
Gate for the deferred map-mismatch warning and "pull what's deployed." Low priority.

---

## Phase 5 - Discovery enrichment (deferred, helper-side)

### H14. Auto-discovery in the helper [transport-coupled]
**Label:** needs-triage · **Depends:** H3

Cloud `/discover` and/or UDP beacons in the helper, surfacing a Controller list to the IDE
transparently (no IDE change vs manual IP). Coverage holes (AP mode, no cloud reg) mean
manual IP stays the universal fallback. Deferred.

---

## Cross-cutting

### H15. ADR-0004: local-helper architecture + packaging decision [transport-agnostic]
**Label:** ready-for-human

Record: why a local helper is structurally unavoidable (https->ws mixed content; cloud
server can't see the LAN); the extension-vs-bridge packaging choice and the H1 outcome;
that this reverses the main PRD's "no backend" promise for hardware features only
(additive, never required for authoring). The PRD already reserves ADR-0004 for this.
Note the licensing courtesy heads-up to Ben Hencke (we execute his compiler).
