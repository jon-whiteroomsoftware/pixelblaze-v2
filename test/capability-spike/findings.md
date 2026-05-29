# Capability spike — findings, bytecode investigation & gate recommendation

Hand-written interpretation of the live run captured in [`report.md`](./report.md)
(auto-generated; do not edit by hand). This is the Phase-2 gate document for the
Hardware Connectivity feature (#108): it decides whether the IDE-integration UI arc
is worth building.

> **Status:** confirmed against the device (`192.168.8.224`, fw 3.67) — see
> `report.md`. Four of five capabilities work; pattern push is the lone gap and is
> spun out to **#112**.

## The read/control surface — solid, low-risk ✅

All confirmed working against the device; these are reliable building blocks for a UI:

- **`listPrograms`** — the type-7 binary frames reassemble (first→middle→last) into
  newline-separated `id\tname` text, decoded by `decodeProgramList`. Confirmed: 8 programs
  decoded cleanly.
- **`activeProgramId`** — set via `{activeProgramId}`, read from the `getConfig` *sequencer*
  packet (`activeProgram.activeProgramId`). Confirmed: switch + re-read matched.
- **`getControls` / `setControls`** — confirmed, with an important asymmetry discovered:
  - `getControls(id)` returns the program's **stored (flash)** controls, nested under the
    program id: `{ controls: { "<id>": { sliderName: value, … } } }`.
  - A no-save `setControls` changes only the **live** values, which surface via
    `getConfig().activeControls` — *not* `getControls(id)`. The spike confirms the live
    value changes (`sliderMode` 0.695 → 0.25) while the stored value stays 0.695, which is
    direct evidence of volatility.
- **`brightness`** — `{brightness, save}`; read back from the `getConfig` *settings* packet
  (top-level `brightness`). Confirmed: 0.2 → 0.8 round-trip.

**Protocol note for a future UI:** `getConfig` replies as **two separate JSON packets** — a
settings packet (top-level `brightness`, etc.) and a sequencer packet (`activeProgram` with
`activeProgramId` and the *live* `controls`). `PixelblazeConnection.getConfig()` awaits both
and merges them.

**Persistence & flash-wear.** `save:true` writes to the ESP flash, which has a finite
erase/write budget. Any UI that persists controls/brightness/active-program must debounce
and avoid per-keystroke saves; live tweaking should stay volatile (no `save`) and persist
only on an explicit user action. The spike itself never saves, so repeated runs are free.

## Pattern push — the headline unknown, and the real gate

**Empirical result (confirmed):** source-only `putSourceCode` is accepted by the socket but
does **not** produce a runnable pattern — the program count stayed at 8 (no new entry).

**Why — the bytecode gap (the decisive finding).** A Pixelblaze does not compile patterns.
The device **runs bytecode**; the ElectroMage editor compiles the Pixelblaze-dialect source
to that bytecode **in the browser** and uploads it. The real save sequence the editor /
`pixelblaze-client` use is, in order:

1. `{"pause":true, "setCode":{"size":<bytecodeLen>,"crc":<crc>,"name":...,"id":...}}`
2. **`putByteCode`** binary frames (message type **3**), the compiled bytecode chunked at
   ≤1280-byte bodies with first/middle/last flags.
3. _(optional)_ **`putSourceCode`** binary frames (type **1**) — the LZString-compressed
   source, stored only so the editor can re-open the pattern for editing. **The device never
   executes this; it is documentation, not code.**
4. `{"setControls":...}` then `{"pause":false}`.

So `putSourceCode` alone (what this IDE could send today) at most populates the *source*
the device hands back to an editor — it cannot make a pattern *run*. The runnable artifact
is the bytecode in step 2, and **the IDE does not produce bytecode**: per ADR-0001/0002 it
transpiles the Pixelblaze dialect to **JavaScript** for the float64 main-thread preview, an
entirely different target from the Pixelblaze VM's fixed-point bytecode.

### Could the IDE produce bytecode?

Two paths, both expensive and risky:

- **(a) Reuse the editor's compiler.** It is closed, minified JS embedded in the firmware's
  web UI, undocumented, and coupled to the firmware version. Lifting it means shipping
  someone else's unlicensed minified blob and re-vendoring it on every firmware bump.
  Fragile and a licensing question.
- **(b) Write our own Pixelblaze-bytecode backend.** The bytecode/VM format is undocumented
  and firmware-versioned. This is a compiler project in its own right (lexer→IR→fixed-point
  bytecode + CRC framing), and it would have to track firmware changes. Large, open-ended.

Neither belongs inside this spike, and neither is cheap enough to take on speculatively.

## Recommendation on the UI arc

**Build a *device-control / monitoring* UI arc; do NOT gate it on pattern push.** Split the
deferred Phase-3 vision into two independently-valuable tracks:

1. **Live device control + fidelity (greenlight-able now).** Browse `listPrograms`, switch
   the active pattern, read/tweak controls and brightness, and drive the divergence/fidelity
   harness against a real device through the local bridge. This is genuinely useful, rests
   entirely on the solid read/control surface above, and is the natural payoff of the
   isomorphic comms layer. The bridge (ADR-0004, still to be written) is the remaining
   prerequisite, not pattern push.

2. **Pattern push (separate, deferred sub-investigation — #112).** Worth building only if
   the bytecode story is solved; tracked in **#112** with a go/no-go on paths (a) vs (b)
   above. Until then, "deploy to hardware" stays out of the IDE; users continue to author in
   the IDE and paste into the stock editor to run on-device.

**Bottom line:** the protocol is rich enough to justify the UI arc — but the value is in
*control and validation*, not in pushing patterns. Push is the one capability that is
undocumented-and-risky, and it is risky precisely because of the bytecode gap, not the
transport.

## Follow-up issues

- **#112** — Pattern-push bytecode investigation: go/no-go on reusing the editor compiler
  vs writing a bytecode backend.
