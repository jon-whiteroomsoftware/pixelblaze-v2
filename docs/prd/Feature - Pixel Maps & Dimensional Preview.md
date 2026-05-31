# Feature PRD — Pixel Maps & Dimensional Preview

**Status:** **Phase 1 shipped** (1D/2D/3D preview, map as a first-class entity, WebGL position+camera renderer, stock plane & cube maps, line/ring shapes, 3D orbit viewport). The sole Phase-1 remainder, the **helix** shape embedding, is tracked in **#139**. **Phase 2 (custom maps) is now greenlit and being built** — the M1 foundations (the `maps` store, `mapStore` CRUD, baked-replay consume path, example clouds) shipped during Phase 1; the **authoring** layer is the active work, re-shaped from the original M-sequence by the decisions in *Phase 2 — Custom maps* below. **Phase 3 (controller map push/pull) remains deferred — captured here as direction, not greenlit.** For *how Phase 1 works as built* see **`docs/REFERENCE.md`** §9 (maps & dimensional preview), §10 (render loop), §11 (preview pane). This PRD is retained for the **why** — the conceptual model and the deferred direction.
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Related:** ADR-0002 (main-thread execution — its deferred-worker analysis lives in *Threading model* below); ADR-0003 (fixed-point fidelity — the spatial layer preserves its numeric seam); **ADR-0004 (`pixelCount` modeled independently of the map)** and **ADR-0005 (display `pos` is dual-sourced: map-intrinsic geometry vs. viewport shape embedding)** — the two data-model decisions this feature rests on; **ADR-0007 (custom maps bake on save; pixelCount drift exposed, not hidden)** — the Phase-2 fidelity decision; `Feature - Hardware Connectivity.md` (Phase 3 map push/pull rides its local bridge)

---

## Summary

The IDE originally previewed **only 2D patterns**, on a single global grid whose pixel positions were *implied by index*. That assumption is exactly what blocked 1D and 3D, and what blocked previewing any map that isn't a uniform rectangle.

This feature makes the **pixel map a first-class concept** — an explicitly-positioned, named, selectable set of points — and rebuilt the preview's spatial layer around it so the IDE renders **1D, 2D, and 3D** patterns. The pattern's own render functions decide the dimensionality; the map supplies where each pixel lives; one position-plus-camera WebGL renderer draws all three (2D being the degenerate, camera-locked case).

The central reframe versus stock ElectroMage tooling is an **ownership inversion**: in ElectroMage the map belongs to a *connected device* (no map without hardware, edited live against the box). **Here the workspace owns the map**, and the controller is an optional downstream consumer. You author and preview against maps entirely offline; pushing a map to a device is a later, deliberate, additive step. Same offline-first stance the main PRD takes for patterns, extended to maps.

Three phases, sequenced so the offline preview is excellent before any hardware concern:

1. **Maps as a concept + the dimensional spatial layer — built-ins only.** **Shipped** (helix remainder → #139).
2. **Custom maps** — author / import / save your own map, so someone with a real irregular installation previews against *their actual geometry*. **Deferred; captured below.**
3. **Controller map push/pull** — configure a device's physical map from the IDE, and read an existing one back. **Deferred; rides the Hardware Connectivity bridge.**

---

## Goals

- **Preview 1D, 2D, and 3D patterns** — the IDE picks the right dimensionality automatically from the pattern's render functions, and renders it faithfully on a map of that dimensionality.
- **Make the map a first-class, workspace-owned entity** — named, persisted, selectable per pattern, on the same footing as a pattern. No controller required at any point in authoring or preview.
- **One spatial model, not three** — a single position+camera renderer where 2D is the degenerate (camera-locked) case, so 1D paths and 3D point clouds are not bolt-on special cases.
- **Lose nothing in the rebuild** — the existing render-loop orchestration (virtual clock, speed, the 16.16 fixed-point numeric seam, the transform-stack hook, FPS, the var-watcher `onFrame`, error handling, one-shot frames) is preserved intact; only the *spatial* layer changes.

## Non-goals

- **Automated mapping / photogrammetry.** Maps are generated (stock) or authored (Phase 2), never derived from photos or sensors.
- **Surface-normal-aware rendering.** A map encodes pixel *position*, not orientation (matches hardware).
- **Bit-exact-on-hardware map normalization.** The preview normalizes per-axis; whether firmware preserves aspect ratio is a documented open question (Risks), not something this feature reverse-engineers.
- **The 3D coordinate-transform stack.** `rotateX/Y/Z`, `translate3D`, `scale3D` — the loop preserves the transform hook; the 3D-specific transforms were deferred with the rest of 3D transform support. *(Note: the 2D/3D transform stack has since been implemented as live CTM ops — see REFERENCE §6.1.)*
- **Custom-map authoring (Phase 2) and controller sync (Phase 3).**

---

## Background: the conceptual model

This is the shared vocabulary and the set of decisions the feature rests on. Six ideas, each one a decision. (Mirrored in `CONTEXT.md`.)

### 1. Order and position are independent channels

A pattern receives two unrelated things about a pixel: its **index** (the electrical position in the LED chain, `0…pixelCount-1`) and its **position** (where it physically sits in space). The index is free and always present. The **map is the position channel** — it exists precisely so position can be something *other* than a trivial function of index. If position were always derivable from index, the map would be redundant; the map earns its keep exactly when it isn't.

### 2. Dimensionality is the map/display dimension; the render fn *names* it

**Dimensionality always means the display/layout dimension (1D / 2D / 3D), never a coordinate-argument count.** Each render fn *names* a dimensionality by a clean bijection: `render` → **1D**, `render2D` → **2D**, `render3D` → **3D**. A `render()` pattern is **1D** even though it takes zero coordinate arguments, because a strip of LEDs is inherently a 1D layout.

A pattern's **native dimensionality** is the highest render fn it defines. That drives exactly two things — the **default map** auto-picked on open, and the **title-bar label**. It does *not* drive dispatch. **Dispatch is driven by the active layout's *sample*-arity**, with the pattern's fallback chain `render3D → render2D → render → noop` (the same selection logic Pixelblaze uses). The IDE only *inverts the driver* for the default selection (workspace-owns-the-map), not for per-frame dispatch.

The "Shape" dropdown is **filtered by `sample`-arity (pattern compatibility)**: a 1D pattern is offered every empty-`sample` shape — and because a 1D shape only sets `pos`, those shapes span 1D/2D/3D *display* (line, ring, helix) while dispatch still calls the 1D `render`. So cosmetic cross-display embedding is in scope; what remains a **deferred manual-override nicety** is *semantic* cross-dimension dispatch (forcing a multi-render-fn pattern to dispatch below its native dimension — see **#135**).

### 3. sample vs. pos — and where pos comes from (ADR-0005)

A pixel resolves to two independent channels, keyed by index:

- **sample** — the normalized coordinates fed to the render function (`[]` for 1D, `[x,y]` for 2D, `[x,y,z]` for 3D). **Always owned by the map.** The only channel a pattern can observe.
- **pos** — where the dot is *drawn*. **Dual-sourced:** *map-intrinsic* when the map encodes real geometry, *viewport-supplied* when the pattern leaves position free.

For the common case they coincide (a 2D grid point samples `(x,y)` and is drawn at `(x,y)`). The interesting layouts are the divergences, split by **who owns `pos`**: a 1D pattern on a ring/helix has *viewport*-supplied `pos` (the path is a pure display choice over an empty `sample`); a 2D pattern draped on a 3D surface has *map*-intrinsic `pos` (the installation's real geometry). The decision rule: a shape is cosmetic (→ viewport supplies `pos`) when the pattern can't observe it, semantic (→ the map owns `pos`) when it defines `sample`. Keeping `sample` map-owned and `pos` dual-sourced from day one is what makes both fall out without re-architecting.

### 4. Normalization, and why irregular topology is the whole point

A map expresses **arbitrary explicit positions**, not just ordering and not just equal spacing. A uniform grid is merely the simplest generator; real installs are irregular (trees, spheres, sculptures), and the map's reason to exist is to capture true geometry so a pattern — a field over normalized space — projects faithfully onto the physical object.

Coordinates are **normalized into 0..1**, with two consequences that look contradictory but aren't: uniformly rescaling a regular cloud is invisible to the pattern (normalization scales it right back into 0..1 — which is why *how* dots are drawn is a display concern, §5); but irregular *relative* structure is real, preserved map content (normalization is an affine scale/translate; it can't regularize uneven spacing). The current preview normalizes **per-axis**, so even aspect ratio is invisible to the pattern — whether hardware preserves aspect ratio is an open question (Risks, and #116).

### 5. Preview light size, diffusion, and (for 1D) shape are viewport concerns

Because of §4, how dots are *drawn* — their size and any blur — is a property of the **camera/viewport**, not the map. The original "spacing" framing was a mistake (after per-count normalization + fit-to-container, moving dots apart is a visual no-op). What the user actually wants is to make the **light sources** bigger or smaller, so the control is **preview light size** (each drawn source's diameter as a fraction of inter-dot pitch, growing in place). **Diffusion** is the independent blur-the-sources-together control with two invariants: it never changes source size and never dims. Both are preview-only and never reach `sample`, a map, or a controller. See [ADR-0006](../adr/0006-preview-light-size-and-diffusion.md).

Likewise, for a 1D pattern the **shape** of the path (line / ring / helix) is cosmetic — a viewport shape embedding, not a map. Two consequences the UI rests on: **one "Shape" dropdown, two code owners** (cosmetic 1D choices route to the viewport embedding; semantic 2D/3D choices route to map selection — the clean distinction lives in the code, the screen shows one knob); and **display dimension can exceed pattern dimension** (a 1D pattern can ride a 3D helix and get the full orbit viewport — the camera control set is gated on the *display* dimension of the active embedding, not the pattern's own dimensionality).

### 6. On hardware the map is the *device's* property (the Phase 3 reframe)

A physical Pixelblaze stores **one map per device**, shared by every pattern. You set it once when you build or change the installation, then run patterns on top of it. This shapes Phase 3: pushing a map is "configure this installation," done deliberately and rarely — **not** bundled with every pattern deploy. Overwriting a device's painstakingly-measured map with a preview default is destructive and must be explicit and guarded; reading the device's existing map *back into* the IDE is the valuable symmetric direction.

---

## Threading model *(analysis; deferred — main-thread stays for this feature)*

3D reopens the question ADR-0002 settled: should pattern execution leave the main thread? This records the analysis so the future decision is pre-researched. **The conclusion for this feature is to stay on the main thread** — consistent with ADR-0002 and the defer-complexity stance. A worker is the designated *future* lever.

### What a worker does and does not buy

A Web Worker **relocates** pattern execution; it does **not accelerate** it. Same engine, same single core, same fixed-point shim cost. So a worker is **not a 3D-throughput fix** (that remains the job of the `pixelCount` cap and the small default 3D map). Its two co-equal prizes are about *where* the work runs:

- **Responsiveness** — the editor, controls, and var-watcher stay live while a heavy 3D pattern grinds; today a slow frame janks the whole UI.
- **A real watchdog** — the big one. ADR-0002 lists a runaway loop freezing the tab as an *unmitigated* consequence. A worker is terminable: the main thread can `terminate()` a stalled worker after a timeout and report "pattern stalled" — the watchdog hardware has and the preview lacks.

### The designated future architecture: one combined worker (config C)

Of three ways to split the work, only one is worth banking: **(C) exec *and* OffscreenCanvas draw together in one worker** — the whole hot loop (render fns → shim → projection → draw) lives in the worker; **pixel buffers never cross the boundary at all.** The only crossings are low-frequency (control changes, camera-orbit events in; var-watcher / FPS snapshots out), so the per-frame `postMessage` cost ADR-0002 warned of evaporates. The alternatives are inferior: (A) exec-in-worker + main-thread draw ships a pixel buffer every frame; (B) draw-only-in-worker is backwards (ships the buffer *into* the worker to draw a single cheap `gl.POINTS` call). OffscreenCanvas is not a separate "thread the WebGL" win — it is the thing that makes an exec-worker clean.

Config (C) **needs no `SharedArrayBuffer`**, which matters because SAB requires cross-origin isolation headers GitHub Pages cannot set. Transferables + low-frequency messaging suffice; SAB would only be forced by trying to keep control callbacks *synchronous* across the boundary (the unattractive path (A) leans toward).

### Cost of the move (why it is deferred, not free)

The honest price: the engine's **synchronous, framework-free orchestration becomes message-passing async** — exactly the model ADR-0002 says the testing strategy depends on. Mitigated by design (the pure modules — `camera.ts`, generators, shim math, dimensionality derivation — stay synchronously unit-testable wherever they run; only `renderLoop` orchestration goes async), but it is real work touching the engine/UI seam, not justified until the watchdog or 3D responsiveness genuinely bites. ADR-0002 remains the active decision; this is forward-looking analysis.

---

## Phase 2 — Custom maps *(greenlit; building)*

The offline-fidelity payoff: a user with a sophisticated real installation previews patterns against **their actual geometry**, not a stock approximation. Built on the exact same representation as stock maps — stock and custom maps are the *same kind of object* in the *same dropdown*; this phase adds creation, not a new system. (The `maps` IndexedDB object store, the `mapStore` CRUD, and per-pattern association — `PatternRecord.mapId` — all already exist from Phase 1; what's unbuilt is the custom-map *source* representation and the authoring UI.)

### The settled model

- **One copy of a map, referenced by id.** A pattern stores only `mapId` (already true). The geometry lives in exactly one `MapRecord`; a thousand patterns can reference it with no duplication. The common case — no override — falls back to the stock plane/cube.
- **"Your Maps" lists custom maps only.** Stock maps stay as always-present options in the Layout selector, never as managed rows (mirrors how saved patterns work — no "stock pattern" in the list). Stock maps are also never **openable** in place; their code is reached only via **templates** (below).
- **`dim` is inferred from coordinate arity**, not declared: `[x,y]` → 2D, `[x,y,z]` → 3D, matching how firmware reports `pixelMapDimensions()`. Mixed arity is a save-time error. **There is no custom 1D map** — a 1D pattern's `sample` is empty, so its in-space arrangement is a cosmetic viewport *shape* (§5), not a map. Custom authoring is a 2D/3D concern.
- **Bake on save; expose pixelCount drift (ADR-0007).** The authoring function/import is evaluated **once at save**, frozen into the `MapRecord` as a coordinate array, and the pattern restarts. A *custom* map's `resolve(pixelCount)` *replays* that frozen array index-aligned (surplus indices → origin, extra entries unvisited) rather than regenerating — so a count that disagrees with the geometry renders the same degraded result a real Pixelblaze shows after you change `pixelCount` without re-saving the Mapper. (Stock maps, by contrast, regenerate live — see *Source-backed stock maps* — and cannot go stale.) Selecting a custom map does **not** pin the count (ADR-0004 holds). Nothing applies until the user saves; this is the "evaluate the mapper once per run" model. A `MapRecord` holds the baked array (what renders) and, for function-authored maps, also the source (re-editable) — source + compiled-output, not duplicated geometry.

### Source-backed stock maps *(the decision this section turns on)*

Every **2D/3D stock map is backed by real, plain-JavaScript map source** — a `function(pixelCount)` returning a coordinate array — and that source is the **single source of truth**: the live preview *runs the source* (ADR-0008's `new Function`, float64, no fixed-point shim), there is no parallel TS generator to drift against. This overturns the earlier model where the plane/cube/cylinder were opaque TS generators and the example clouds (helix/sphere/ring) were baked arrays with no source. The point is pedagogical and for-coders: anywhere a 2D/3D map is in play, a curious Pixelblaze user can reach the exact function that makes it.

Five properties pin the design:

1. **Single source of truth (ADR-0008).** The `.js` the user sees *is* the `.js` the preview runs. No display-only copy, no two-implementations drift hazard.
2. **Live regeneration, not baked replay.** Because each stock map has a real `function(pixelCount)`, it regenerates for any count — so baked replay (ADR-0007) is now a **custom-map-only** mechanism. The example clouds (helix/sphere/ring) become live generators like the rest; they can no longer go stale or origin-snap on a count bump. (ADR-0007 amended accordingly.)
3. **Hardware-Mapper-faithful and self-contained (ADR-0008).** The source reads like a function you could paste straight into a real Pixelblaze Mapper tab: top-level `function(pixelCount)`, `Math.*` and language built-ins only — **no IDE helpers, no library imports, no namespacing** (maps deliberately don't get the pattern library system, matching hardware). Lifting "that's how Sphere works" onto a real device must be honest.
4. **Raw geometry; the engine normalizes.** The source returns coordinates in natural units (`cos/sin` in `[-1,1]`, raw lattice indices), and a single shared engine pass normalizes per-axis into `[0,1]` — mirroring how firmware normalizes a Mapper's output at bake. Plane/cube/cylinder stop hand-baking `i/(n-1)` into their constants; the normalizer does it uniformly. The per-axis-vs-aspect question (#116) now has exactly one home: that pass. (Per-axis stays for now — no preview regression.)
5. **One exception: the drape cylinder.** The cylinder is the Case-1 "2D-pattern-drawn-on-a-tube" construct (`sample:[u,v]` ≠ `pos:[x,y,z]`, `dim:2`/`displayDim:3`; see §3 and the two-cases note below). A hardware Mapper function returns one array that *is* the sample — it has no separate draw channel — so the drape has **no single faithful function** and therefore **no source and no template**. It stays an IDE-only preview convenience, explicitly labeled as having no Mapper analog. Every *source-backed* stock map is one where `sample == pos` (plane, ring, cube, sphere, helix).

**Two cases that must stay distinct** (the data model already separates them by **sample arity**): *Case 1* — a **2D pattern** on a **2D map** merely *drawn* wrapped on a cylinder surface (the drape; pattern can't observe the third axis). *Case 2* — a **true 3D pattern** on a **3D map** (poles/sculptures: lights genuinely in space, pattern observes all three axes). Source-backing must never collapse Case 1 into Case 2. A **true-3D tube/pole** (Case 2, source-backed, `sample==pos`) is a sensible later catalogue addition; deferred for now.

### The New Map authoring flow *(M3, the active surface)*

A coder-first flow; the **map-function editor is the primary (and first) authoring surface**, ahead of coordinate import:

- **New Map** opens the editor immediately on a fresh custom map, pre-filled with a **default working skeleton** — a minimal valid `function(pixelCount)` returning a short 2D line, so the editor opens *rendering something*, not compile-broken or empty.
- A **"Load template" dropdown** lets the user **browse stock maps** without committing up front; selecting one replaces the buffer with that stock map's verbatim source. Template load copies **source text only** — never name (user-set) or `dim` (inferred at bake).
- **Dirty-guard:** loading a template is silent when the buffer is **pristine** (byte-identical to the last-loaded baseline — the skeleton, or a previously-loaded template) and **confirms before overwriting** once the user has edited. The baseline resets to whatever was last loaded, so a user can browse templates freely until they touch something.
- Editing the skeleton directly and saving — never loading a template — is a perfectly valid hand-written custom map. The template dropdown is optional, not required.
- Loading a stock template is the **only** way to see stock-map code; stock maps remain non-openable in place.

### Build sequence (re-shaped from the original M1→M4)

M1 (consume path: baked-replay `resolve`, `mapStore` CRUD, the example clouds) **shipped during Phase 1**. The authoring sequence is re-ordered to put the function editor first and to add the stock-source foundation the templates depend on:

1. **Stock-source foundation** *(new root work)* — convert the 2D/3D stock maps (plane, ring, cube, sphere, helix) to source-backed plain-`.js` files (one file per map, read raw and `new Function`-evaluated), add the thin TS catalogue pairing each id/name with its `?raw` source, and introduce the shared per-axis **normalize** pass. The live preview runs the source; output stays byte-stable for the plane (2D no-regression baseline). The drape cylinder is excluded (no source). This is the prerequisite for templates and is independently valuable (it's the single source of truth for the preview).
2. **Map mode (open + parse + bare-geometry)** *(#151)* — the editor's third flavor: open a custom map's source, JS language mode, **parse-only** compile badge, bare-geometry point-cloud preview. View/parse only; no eval/bake yet. Also hosts the **New Map** entry (skeleton + "Load template" dropdown + dirty-guard).
3. **Map-function editor (eval/bake/apply)** *(#143, PRD M3)* — make map mode runnable: evaluate the source via a plain-JS `new Function` (float64, never the fixed-point shim, ADR-0008), bake once on save (ADR-0007), apply to the running preview, infer `dim` from arity, surface eval/runtime errors gracefully. Carries the bounded one-shot-eval runaway-loop exposure ADR-0002 flags.
4. **Coordinate-import builder** *(#142, deprioritized sibling)* — paste/upload an explicit point list, wrapped as a literal-returning plain-JS source so the result is still openable/editable. Retained for the user who has *measured* coordinates from a real install but no generating function; no longer the first authoring surface.
5. **Stale-map affordance** *(#144, PRD M4)* — when the active count no longer matches a baked *custom* map, surface a "re-save to regenerate" cue, mirroring the hardware Mapper-save step. (Stock maps regenerate live and never show it.)

Irregular/arbitrary topology is fully supported by construction (§4).

---

## Phase 3 — Controller map push/pull *(deferred; rides the Hardware Connectivity bridge)*

Make a workspace map deployable to, and readable from, a real device — as a **deliberate device-configuration action**, never part of routine pattern deploy (§6).

- **Push** — write a selected map to the device's single map slot. Guarded and explicit (it overwrites the installation's physical-layout description). Likely a confirmation + a clear "this configures the device, not the pattern" framing.
- **Pull / read-back** — import the device's current map into the IDE, so the preview reflects what's actually deployed. Arguably the safer and more useful first direction.
- **Transport** — reuses `PixelblazeConnection` and the local bridge from `Feature - Hardware Connectivity.md`; map read/write protocol support is a capability to confirm in that feature's Phase 2 spike. No new transport here.

---

## Risks & open questions

- **Hardware normalization rule (per-axis vs aspect-preserving).** The preview normalizes per-axis, so aspect ratio is currently invisible to patterns. If firmware preserves aspect ratio, non-square maps would preview differently than they run. *Mitigation:* keep per-axis for now; characterise against a real device via the divergence harness before committing the semantics; treat as documented divergence if confirmed. Tracked in **#116**.
- **3D performance is dominated by pattern execution, not drawing.** WebGL solves the draw layer (one `gl.POINTS` call, additive blend, no depth sort for 2D/1D). The real risk is **layer 1**: a volumetric map runs the per-pixel JS render fn thousands of times per frame — worst under the Precise renderer. *Mitigation:* the 65,536 total-`pixelCount` cap, a small default 3D map (512), the dispatch guarantee that 2D patterns never compute a z, and the FPS readout as a live guardrail. (Tracked tuning: **#138**, **#99**.)

---

## Appendix — the map data model (representative)

Illustrative shape (matches the shipped types in `src/engine/maps/types.ts`). The split that matters (ADR-0005): the **map** always owns `sample`, and owns `pos` only when it is real geometry; a **viewport shape embedding** owns `pos` for cosmetic 1D shapes.

```ts
interface MapPoint {
  sample: number[]                                    // coords fed to the render fn: [] (1D) | [x,y] (2D) | [x,y,z] (3D) — MAP owns
  pos?: [number, number] | [number, number, number]  // map-intrinsic position (real geometry); ABSENT for a 1D map,
}                                                     //   whose pos is supplied by the viewport shape (below)

interface PixelMap {                                  // real geometry: plane, cube, Phase-2 measured installs
  id: string
  name: string
  builtin: boolean
  dim: 1 | 2 | 3                    // DISPLAY dimensionality (not arg count). Names the render fn for default selection.
  resolve(pixelCount: number): MapPoint[]   // handed pixelCount (ADR-0004 — the map does NOT own the count); one MapPoint per index
}

interface ShapeEmbedding {                            // viewport-owned 1D cosmetic shape: line, ring, (helix → #139)
  id: string
  name: string
  displayDim: 1 | 2 | 3            // where it DRAWS (line=1, ring=2, helix=3); gates the viewport controls (§5)
  embed(index: number, pixelCount: number): [number, number] | [number, number, number]  // pure pos generator over an empty sample
}
```

The render pipeline reads `pos` from whichever source applies:
`index → map.sample` feeds the pattern; `index → (map.pos ?? shape.embed(index, pixelCount))` feeds the camera. `sample.length` is the mechanical coord count; the *display* dimension (`shape.displayDim`) is what gates the viewport — they are not the same number (a 1D layout has `sample: []` but may display in 1/2/3D).
