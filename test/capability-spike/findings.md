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
  vs writing a bytecode backend. **Resolved — see below.**

---

## #112 Resolution — GO on path (a), proven on hardware (2026-05-29)

The bytecode investigation is closed with an empirical **go**. Step-zero PoC
(`bytecode-poc.py`) compiled a pattern *headless* and rendered it on the device
(`192.168.8.224`, fw 3.67) — a moving rainbow, visually confirmed. No flash write.

### What the PoC retired (the one real unknown)

> Can ElectroMage's compiler, pulled off the device and run **outside the browser**,
> emit bytecode the device accepts and runs?

Yes. Result blob: **83 bytes**, head `400000000b00000008000000…`, decoding cleanly
to the format reverse-engineered from `pixelblaze-client`:

- DWORD opcode-section size = `0x40` = 64 bytes
- DWORD exports-section size = `0x0b` = 11 bytes
- 8 (two DWORDs) + 64 + 11 = **83** ✓ — header matches total length exactly.

`sendPatternToRenderer` pushed it via `putByteCode` (binary type 3) and the strip
rendered it live. This also satisfies the AC "real frame bytes as concrete evidence":
rather than passively sniffing the stock editor, we **reproduced the whole pipeline**
(compile → frame → push → execute) and captured the actual bytecode.

### The decisive mechanism (corrects an earlier assumption here)

Nobody compiles Pixelblaze source from scratch — not Python, not the device. The
**only** compiler is ElectroMage's closed, minified JS, embedded per-firmware in the
device's `index.html.gz`. `pixelblaze-client` produces bytecode by **downloading that
compiler from the connected device and running it in a non-browser JS host** (MiniRacer
/ V8). The JS host is interchangeable (browser ↔ MiniRacer ↔ `node:vm`); the compiler
and its proprietary bytecode output are not. So "reuse the editor's compiler" does **not**
require vendoring a blob: fetch it live from the device, version-matched automatically.

### Paths assessed

| | (a) Reuse device's compiler | (b) Own bytecode backend |
|---|---|---|
| Compiler | ElectroMage's, fetched live from device per firmware | Write lexer→IR→fixed-point bytecode + CRC framing |
| Effort | Small — **proven today** | Large, open-ended; nobody has done it |
| Bytecode format | Produced by their compiler; we never hand-author it | Must reverse-engineer undocumented, hardware/firmware-versioned VM |
| Maintenance | Extraction is string-scraping a minified bundle; broke historically at fw ~3.0 / ~3.20 / ~3.4 (4 adapters in `pixelblaze-client`). fw 3.67 works on the current adapter **out of the box** | Track every firmware/VM change ourselves |
| Licensing | Runs their code, fetched from the user's own device, never redistributed — soft, but their code | Clean (our code) |
| Verdict | **GO** | **NO** — strictly dominated |

### Recommendation & cost

**GO on (a); hard NO on (b).** Implementation home is the **ADR-0004 bridge (Node)**,
not the browser: do the device HTTP-fetch + compiler execution server-side in a
`node:vm` sandbox (no MiniRacer needed, no CORS/mixed-content, untrusted blob isolated
from the app origin). This mirrors `pixelblaze-client` almost line-for-line.

Rough cost if scheduled: **~2–3 days** — bridge endpoint that fetches/caches the
compiler per device-version and runs it in `node:vm` (~1d); blob framing, already
reverse-engineered (~½d); the `setCode`/`putByteCode`/`setControls`/unpause save
sequence, already documented (~½d) — plus a standing **adapter-maintenance** line item
(budget ~one extraction-adapter fix per couple of firmware releases). The unbounded
risk (writing a compiler) is the path we decline.

### Gating & caveats

- **Not gated on bytecode anymore — gated on the bridge.** Same prerequisite (ADR-0004)
  as the rest of the live-device arc.
- **Licensing**: an explicit decision before shipping; a courtesy heads-up to Ben Hencke
  is warranted since we execute his compiler.
- **Firmware coupling is real but bounded**: today's adapter handles 3.67; expect to
  add adapters as ElectroMage refactors the bundle. **Resolved — see below.**

---

## #112 Resolution — GO on path (a), proven on hardware (2026-05-29)

The bytecode investigation is closed with an empirical **go**. Step-zero PoC
(`bytecode-poc.py`) compiled a pattern *headless* and rendered it on the device
(`192.168.8.224`, fw 3.67) — a moving rainbow, visually confirmed. No flash write.

### What the PoC retired (the one real unknown)

> Can ElectroMage's compiler, pulled off the device and run **outside the browser**,
> emit bytecode the device accepts and runs?

Yes. Result blob: **83 bytes**, head `400000000b00000008000000…`, decoding cleanly
to the format reverse-engineered from `pixelblaze-client`:

- DWORD opcode-section size = `0x40` = 64 bytes
- DWORD exports-section size = `0x0b` = 11 bytes
- 8 (two DWORDs) + 64 + 11 = **83** ✓ — header matches total length exactly.

`sendPatternToRenderer` pushed it via `putByteCode` (binary type 3) and the strip
rendered it live. This also satisfies the AC "real frame bytes as concrete evidence":
rather than passively sniffing the stock editor, we **reproduced the whole pipeline**
(compile → frame → push → execute) and captured the actual bytecode.

### The decisive mechanism (corrects an earlier assumption here)

Nobody compiles Pixelblaze source from scratch — not Python, not the device. The
**only** compiler is ElectroMage's closed, minified JS, embedded per-firmware in the
device's `index.html.gz`. `pixelblaze-client` produces bytecode by **downloading that
compiler from the connected device and running it in a non-browser JS host** (MiniRacer
/ V8). The JS host is interchangeable (browser ↔ MiniRacer ↔ `node:vm`); the compiler
and its proprietary bytecode output are not. So "reuse the editor's compiler" does **not**
require vendoring a blob: fetch it live from the device, version-matched automatically.

### Paths assessed

| | (a) Reuse device's compiler | (b) Own bytecode backend |
|---|---|---|
| Compiler | ElectroMage's, fetched live from device per firmware | Write lexer→IR→fixed-point bytecode + CRC framing |
| Effort | Small — **proven today** | Large, open-ended; nobody has done it |
| Bytecode format | Produced by their compiler; we never hand-author it | Must reverse-engineer undocumented, hardware/firmware-versioned VM |
| Maintenance | Extraction is string-scraping a minified bundle; broke historically at fw ~3.0 / ~3.20 / ~3.4 (4 adapters in `pixelblaze-client`). fw 3.67 works on the current adapter **out of the box** | Track every firmware/VM change ourselves |
| Licensing | Runs their code, fetched from the user's own device, never redistributed — soft, but their code | Clean (our code) |
| Verdict | **GO** | **NO** — strictly dominated |

### Recommendation & cost

**GO on (a); hard NO on (b).** Implementation home is the **ADR-0004 bridge (Node)**,
not the browser: do the device HTTP-fetch + compiler execution server-side in a
`node:vm` sandbox (no MiniRacer needed, no CORS/mixed-content, untrusted blob isolated
from the app origin). This mirrors `pixelblaze-client` almost line-for-line.

Rough cost if scheduled: **~2–3 days** — bridge endpoint that fetches/caches the
compiler per device-version and runs it in `node:vm` (~1d); blob framing, already
reverse-engineered (~½d); the `setCode`/`putByteCode`/`setControls`/unpause save
sequence, already documented (~½d) — plus a standing **adapter-maintenance** line item
(budget ~one extraction-adapter fix per couple of firmware releases). The unbounded
risk (writing a compiler) is the path we decline.

### Gating & caveats

- **Not gated on bytecode anymore — gated on the bridge.** Same prerequisite (ADR-0004)
  as the rest of the live-device arc.
- **Licensing**: an explicit decision before shipping; a courtesy heads-up to Ben Hencke
  is warranted since we execute his compiler.
- **Firmware coupling is real but bounded**: today's adapter handles 3.67; expect to
  add adapters as ElectroMage refactors the bundle.
