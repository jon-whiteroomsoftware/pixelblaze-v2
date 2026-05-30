# Feature PRD — Pixel Maps & Dimensional Preview

**Status:** proposed — not yet greenlit
**Type:** Feature PRD (companion to `Pixelblaze IDE v2 PRD.md`)
**Supersedes:** the main PRD's Deferred items "1D `render(index)` support" and "`render3D` support"; reframes the single global **Preview grid** as the degenerate case of a first-class **map**
**Related:** ADR-0002 (main-thread execution — unchanged; its deferred-worker analysis now lives in *Threading model* below); ADR-0003 (fixed-point fidelity — the new spatial layer must preserve its numeric seam); **ADR-0004 (`pixelCount` modeled independently of the map)** and **ADR-0005 (display `pos` is dual-sourced: map-intrinsic geometry vs. viewport shape embedding)** — the two data-model decisions this feature rests on; `Feature - Hardware Connectivity.md` (Phase 3 map push/pull rides its local bridge)

---

## Summary

The IDE previews **only 2D patterns**, on a single global square-ish grid whose pixel positions are *implied by index* — `col = i % cols`, `row = i / cols`, screen position `col × spacing` (`src/engine/renderer.ts`, `src/engine/renderLoop.ts`). Position is never an explicit, per-pixel thing; it is a function of the loop counter. That assumption is exactly what blocks 1D and 3D, and what blocks previewing any map that isn't a uniform rectangle.

This feature makes the **pixel map a first-class concept** — an explicitly-positioned, named, selectable set of points — and **rebuilds the preview's spatial layer** around it so the IDE renders **1D, 2D, and 3D** patterns. The pattern's own render functions decide the dimensionality; the map supplies where each pixel lives; one position-plus-camera renderer draws all three (2D being the degenerate, camera-locked case).

The central reframe versus stock ElectroMage tooling is an **ownership inversion**: in ElectroMage the map belongs to a *connected device* (there is no map without hardware, and you edit it live against the box). **Here the workspace owns the map**, and the controller is an optional downstream consumer. You author and preview against maps entirely offline; pushing a map to a device is a later, deliberate, purely additive step. This is the same offline-first stance the main PRD takes for patterns, extended to maps.

It ships in three phases, sequenced so the offline preview is excellent before any hardware concern:

1. **Maps as a concept + the dimensional spatial layer — built-ins only.** The map becomes a real entity threaded through the stores, the eval loop, and the preview pane; the spatial layer is rebuilt as position+camera; the IDE ships a curated set of built-in layouts — stock *maps* (plane, volumetric cube) plus viewport *shape embeddings* (line, ring) per ADR-0005. **The build-now phase. Internally staged 1a → 1b** so a complete 2D/1D slice ships before the 3D viewport.
2. **Custom maps** — author / import / save your own map. This is the offline-fidelity payoff: someone with a real irregular installation (a tree, a sphere, a sculpture) can preview patterns against *their actual geometry*. **Deferred; captured here.**
3. **Controller map push/pull** — configure a device's physical map from the IDE, and read an existing one back. **Deferred; rides the Hardware Connectivity bridge, and is a guarded, deliberate "configure this installation" action — never bundled with routine pattern deploys.**

Phase 1 stands alone and is independently valuable. Phases 2–3 are recorded as direction, not greenlit.

---

## Goals

- **Preview 1D, 2D, and 3D patterns** — the IDE picks the right dimensionality automatically from the pattern's render functions, and renders it faithfully on a map of that dimensionality.
- **Make the map a first-class, workspace-owned entity** — named, persisted, selectable per pattern, on the same footing as a pattern. No controller required at any point in authoring or preview.
- **One spatial model, not three** — a single position+camera renderer where 2D is the degenerate (camera-locked) case, so 1D paths and 3D point clouds are not bolt-on special cases.
- **Lose nothing in the rebuild** — the existing render-loop orchestration (virtual clock, speed, the 16.16 fixed-point numeric seam, the transform-stack hook, FPS, the var-watcher `onFrame`, error handling, one-shot frames) is preserved intact; only the *spatial* layer changes.
- **Ship incrementally** — the first slice looks and behaves exactly like today's 2D grid (now driven by an explicit map), proving the new architecture without a visible regression, before 3D lands.

## Non-goals

- **Automated mapping / photogrammetry.** The IDE does not derive a map from photos or sensors; maps are generated (stock) or authored (Phase 2).
- **Surface-normal-aware rendering.** A map encodes pixel *position*, not orientation. Patterns sample a field at each pixel's location; "which way an LED faces" is not modelled (matches hardware).
- **Bit-exact-on-hardware map normalization.** The preview normalizes per-axis (see Background); whether firmware preserves aspect ratio is a documented open question, not something this feature reverse-engineers (it can later be characterised by the divergence harness).
- **The 3D coordinate-transform stack.** `rotateX/Y/Z`, `translate3D`, `scale3D` remain inert no-ops, consistent with the main PRD's deferral of the transform stack. The new loop preserves the transform hook but does not implement 3D transforms.
- **Custom-map authoring (Phase 2) and controller sync (Phase 3)** — captured, not built in Phase 1.

---

## Background: the conceptual model

This section is the shared vocabulary the rest of the PRD assumes. Six ideas, each one a decision.

### 1. Order and position are independent channels

A pattern receives two unrelated things about a pixel: its **index** (the electrical position in the LED chain, `0…pixelCount-1`) and its **position** (where it physically sits in space). The index is free and always present. The **map is the position channel** — it exists precisely so position can be something *other* than a trivial function of index. Two pixels adjacent in index may be far apart in space, and vice-versa. If position were always derivable from index, the map would be redundant; the map earns its keep exactly when it isn't.

### 2. Dimensionality is the map/display dimension; the render fn *names* it

**Dimensionality always means the display/layout dimension (1D / 2D / 3D), never a coordinate-argument count.** A pattern exports some subset of `render(index)`, `render2D(index, x, y)`, `render3D(index, x, y, z)`, and each render fn *names* a dimensionality by a clean bijection: `render` → **1D**, `render2D` → **2D**, `render3D` → **3D**. A `render()` pattern is **1D** even though it takes zero coordinate arguments, because a strip of LEDs is inherently a 1D layout. The coordinate-arg count (0 / 2 / 3) is just the mechanical length of the `sample` array (§3) — *not* the dimension number. (See `CONTEXT.md` → *Dimensionality*.)

A pattern's **native dimensionality** is the highest render fn it defines. That native dimensionality drives exactly two things — the **default map** auto-picked on open, and the **title-bar label**. It does *not* drive dispatch.

**Dispatch is driven by the active layout's *sample*-arity, with the pattern's fallback chain** `render3D → render2D → render → noop` — the same selection logic Pixelblaze uses (the installed map's dimensionality selects the render fn, falling back when a higher one is absent). The IDE only *inverts the driver* for the default selection (workspace-owns-the-map), not for the per-frame dispatch. In v1 the "Shape" dropdown is **filtered by `sample`-arity (pattern compatibility)**: a pattern is offered every layout whose `sample` it can consume. For a 1D pattern that means every empty-`sample` shape — and because a 1D shape only sets `pos` (§5, ADR-0005), those shapes span 1D/2D/3D *display* (line, ring, helix) while dispatch still calls the 1D `render`. So cosmetic cross-display embedding (a 1D strip drawn on a 2D ring or 3D helix) is **in v1**, not deferred. What remains the **deferred manual-override nicety** is *semantic* cross-dimension dispatch — forcing a pattern that defines several render fns to dispatch at a lower one than its native (e.g. viewing a `render2D`+`render3D` pattern as 2D).

The render-fn presence set already exists: `bundle()` emits `metadata.renderFns = { hasBeforeRender, hasRender2D, hasRender }` via the Acorn AST pass (`bundle.ts`). The feature **extends it with `hasRender3D`** and threads it down into `loadPattern` (today only `BundleMetadata` carries `renderFns`; `PatternMetadata`, which `loadPattern` consumes, does not — so the field must be threaded to drive dispatch). Today `loadPattern.ts` exposes only a `render2D` slot, with a JS-level fallback that runs a bare `render(index)` *through* the render2D slot (ignoring `x,y`); `render3D` is not wired at all. The feature gives the handle explicit `render`/`render2D`/`render3D` slots and a real fallback chain so the loop dispatches by the active layout's `sample`-arity.

### 3. sample vs. pos — and where pos comes from (ADR-0005)

A pixel resolves to two independent channels, keyed by index:

- **sample** — the normalized coordinates fed to the render function (length matches the render fn: `[]` for 1D `render`, `[x,y]` for 2D, `[x,y,z]` for 3D). **Always owned by the map.** It is the only channel a pattern can observe.
- **pos** — where the dot is *drawn* (a 2D or 3D position). **Dual-sourced (ADR-0005):** *map-intrinsic* when the map encodes real geometry, *viewport-supplied* when the pattern leaves position free.

For the common case `sample` and `pos` coincide and both come from the map: a 2D grid point samples `(x,y)` and is drawn at `(x,y)`. But they diverge, and the interesting layouts are exactly the divergences — split by **who owns `pos`**:

- **1D pattern on a ring or helix — `pos` is *viewport*-supplied.** `render(index)` consumes only the index (`sample` is empty), so where the dot is drawn is a pure display choice. Line, ring, polygon, helix are the *same* index sequence with the *same* (empty) `sample`; they differ only in `pos`. The choice of path is therefore a **viewport shape embedding** (§5), not different map content. The chase "spins" for free because index increases around the path.
- **2D pattern draped on a 3D surface — `pos` is *map*-intrinsic.** The pattern samples a 2D `(u,v)` unwrap (which the map owns), and the dot is drawn at a 3D position *on the object* (which the map also owns — it is the installation's real geometry, not a display choice).

The decision rule is the §5 cosmetic-vs-semantic line: a shape is cosmetic (→ viewport supplies `pos`) when the pattern can't observe it (`sample` unchanged), and semantic (→ the map owns `pos`) when it defines `sample`. Keeping `sample` map-owned and `pos` dual-sourced from day one is what makes both fall out without re-architecting. Phase 1's own 1D ring shape already exercises "empty `sample`, viewport-supplied 2D `pos`," so the split is validated immediately, not speculatively — now on the *viewport* side rather than as a map.

### 4. Normalization, and why irregular topology is the whole point

A map expresses **arbitrary explicit positions**, not just ordering and not just equal spacing. A uniform grid is merely the *simplest generator* — a matrix panel's LEDs genuinely are evenly spaced, so its map is uniform; the map reflects reality rather than imposing regularity. Real installs are irregular (trees, spheres, signs, sculptures), and the map's reason to exist is to capture that true geometry so a pattern — a field defined over normalized space — projects faithfully onto the physical object.

Coordinates are **normalized into 0..1**. Two consequences that look contradictory but aren't:

- **Uniformly rescaling a regular cloud is invisible to the pattern** — normalization scales it right back into 0..1. (This is why how the dots are drawn — **preview light size** and diffusion — is a *display* concern; see §5.)
- **Irregular relative structure is real, preserved map content** — normalization is an affine scale/translate; it relocates the whole cloud into the unit range but cannot regularize uneven spacing. Irregularity survives intact.

The current preview normalizes **per-axis** (`x = col/(cols-1)`, `y = row/(rows-1)`), so even aspect ratio is currently invisible to the pattern. Whether hardware preserves aspect ratio is an **open question** (flagged in Risks); the feature keeps per-axis normalization for now and leaves the door open to characterise and match hardware later.

### 5. Preview light size, diffusion, and (for 1D) shape are viewport concerns

Because of §4, how the dots are *drawn* — their size and any blur — is a property of the **camera/viewport**, not the map: it changes the picture, never the pattern's input, because §4 normalizes each axis from the *counts*. The original framing here was a "spacing" control that moved dots uniformly apart; that was a mistake — after per-count normalization and fit-to-container, moving dots apart is a visual no-op. What the user actually wants is to make the **light sources** bigger or smaller. So the control is **preview light size**: it sets each drawn source's diameter as a fraction of the inter-dot pitch (`diameter = pitch × f`, f ≈ 0.15→0.95, default 0.5), growing the sources *in place* — positions and the layout's extent never move. It works identically in 1D/2D/3D (the line keeps its length, the plane/cube keep their bounds; in 3D the orb gains volume) because "almost touching" is anchored to pitch, not to absolute pixels. **Diffusion** is the independent blur-the-sources-together control with two invariants — it never changes source size and never dims (brightness alone changes brightness). Both are preview-only and never reach `sample`, a map, or a controller. See [ADR-0006](../adr/0006-preview-light-size-and-diffusion.md).

Likewise, for a `render`-only (1D) pattern, the **shape** of the path (line / ring / polygon / spiral / helix) is cosmetic: the pattern consumes only the index, so the path only chooses where dots are drawn — it supplies `pos`, never `sample`. That makes the 1D shape a **viewport shape embedding**, owned by the viewport, not a map (ADR-0005). A shape becomes *semantic* (real pattern input) only when the pattern consumes the coordinates — i.e. it's a `render2D`/`render3D` pattern, at which point the "shape" *is* a non-grid 2D/3D map, not a 1D path.

Two consequences the UI rests on:

- **One "Shape" dropdown, two code owners.** The UI deliberately blurs the line — a single control lets you pick line/ring/helix for a 1D pattern *or* plane/cube for a 2D/3D pattern. Underneath, the cosmetic 1D choices route to the viewport embedding and the semantic 2D/3D choices route to map selection. The clean distinction lives in the code; the screen shows one knob.
- **Display dimension can exceed pattern dimension.** Because a 1D shape only sets `pos`, a 1D pattern can be embedded in a 2D ring or a *3D helix*. The viewport's control set (locked-2D top-down vs. orbitable 3D) is therefore gated on the **display dimension of the active embedding**, not the pattern's own dimensionality — a 1D-pattern-on-a-helix gets the full 3D orbit viewport. The shape dropdown is filtered by **`sample`-arity** (which shapes the pattern can consume), so a 1D pattern is offered every empty-`sample` shape across 1D/2D/3D display.

### 6. On hardware the map is the *device's* property (the Phase 3 reframe)

A physical Pixelblaze stores **one map per device**, shared by every pattern, describing where that installation's LEDs actually are. You set it once when you build or change the physical thing, then run patterns on top of it. This shapes Phase 3: pushing a map is "configure this installation," done deliberately and rarely — **not** bundled with every pattern deploy. Overwriting a device's real, painstakingly-measured map with a preview default is destructive and must be explicit and guarded; reading the device's existing map *back into* the IDE (to preview against what's truly deployed) is the valuable symmetric direction.

---

## Phase 1 — Maps as a concept + the dimensional spatial layer *(build now; staged 1a → 1b)*

The decision that scopes this phase: **rebuild the spatial layer only; keep the loop orchestration.** The existing rendering code is two layers with opposite verdicts.

### What is replaced vs. preserved

**Replaced — the spatial layer (small, and the part that is intrinsically 2D-grid-coupled):**

- `src/engine/renderer.ts` — `createRenderer().paint()` positions every dot from the grid index (`col = i % cols`, `cx = col*spacing`). It has no concept of a per-pixel position and cannot be bent to arbitrary maps; its core assumption *is* the thing that changes. ~90 lines, little to preserve. Becomes a **thin WebGL draw wrapper** over the pure `camera.ts` projection module. (Its `MAX_GRID_DIM` per-axis guard becomes the single total-`pixelCount` cap.)
- The coordinate-generation inside `renderLoop.ts` `doTick()` — the nested `rows × cols` loop that synthesizes `x = col/(cols-1)` and calls `handle.render2D(row*cols+col, …)`. Replaced by "iterate the active map's points; feed each point's `sample` coords to the dimensionality-appropriate render function."

**Preserved — the loop orchestration (the fixed-point / clock / watcher integration; do not rewrite):** everything else in `renderLoop.ts` — `clock.advance`, speed scaling, `shim.encodeScalar` (the raw-int32 boundary for ADR-0003 fidelity), the `shim.transformPoint` hook, the FPS window, `onFrame` (feeds the var watcher and builtins sampling), `onError`, and `renderPreviewFrame()` for one-shot frames. The change inside `doTick` is surgical (swap the inner loop's coord source and render-fn dispatch); the file is not greenfielded.

### The position + camera renderer

One renderer draws all dimensionalities by projecting normalized positions through a **camera**:

- **2D = a locked orthographic top-down camera.** Visually equivalent to today's grid. This is the degenerate case, not a separate path.
- **3D = an orbitable camera with depth cueing** (nearer dots larger/brighter).
- **1D = positions along a path** (line in screen space, ring/polygon in 2D, helix in 3D) — drawn by the same camera.

**Renderer technology — raw WebGL (no Three.js).** The unified spatial renderer is **WebGL**, chosen for performance, not a hand-rolled Canvas-2D projection. Reasoning: there are two independent per-frame compute layers — (1) **pattern execution**, the per-pixel render fn through the shim (JS, main thread, the existing Fast/Precise cost), and (2) the **spatial/draw layer**, projecting positions and drawing dots (today `ctx.arc()` *per pixel per frame*, `renderer.ts:60-79`). WebGL crushes layer 2 — one vertex buffer of positions+colors drawn with `gl.POINTS` in a single call — and makes projection a vertex-shader matrix multiply, so routing the degenerate 2D camera through the unified pipeline costs essentially nothing extra. A point cloud is a trivial WebGL program, so raw WebGL stays dependency-light; Three.js is rejected as overkill. Recorded in the PRD only (no ADR — single-author project, no realistic reversal). Glowing LEDs are **additive light**, so **additive blending is used and is order-independent — there is no painter's-order depth sort.** The CSS `diffusion` blur still applies as a filter on the WebGL canvas, unchanged.

**Engine/UI split — pure camera + thin GL wrapper.** Per the project's hard engine/UI boundary, the renderer splits into: a **pure camera/projection module** (`src/engine/`, no DOM) — `pos` → clip coordinates, the orbit-camera matrix, depth scaling, fit-to-container, the preview-light-size scale — which is the **real test target**; and a **thin WebGL drawing wrapper** that fills the vertex buffer and issues the draw, **no-opping when there is no GL context** (jsdom/test), exactly as `createRenderer` degrades without a 2D context today (`renderer.ts:41-46`). The tricky math is unit-tested as pure functions, not eyeballed.

**Performance is an explicit non-functional requirement.** WebGL addresses layer 2 only; the dominant *new* cost of 3D is **layer 1** — a volumetric map runs the per-pixel JS pattern loop thousands of times, which WebGL cannot help. Therefore: **2D must not regress in pattern-exec cost** (the dispatch model guarantees a 2D pattern calls `render2D` only and never computes a z), and **3D pixel counts are capped** (see Caps below). The existing FPS readout is the live guardrail.

**Reveal-2D-first.** The general WebGL renderer is built up front but exposed initially **locked to the 2D top-down camera**, so the first shippable slice is *visually equivalent* to the current grid (now fed by an explicit map instead of grid-index math). The 3D camera unlock comes in 1b. This is how "build the general thing" and "ship small increments" coexist.

### Caps & freeze guard

- **Single total-`pixelCount` ceiling of 65,536**, replacing today's per-axis `MAX_GRID_DIM = 256` as the freeze guard. Unchanged effective 2D maximum (256² = 65,536), but now dimension-agnostic — a per-axis cap of 256 would let a 3D map reach 256³ ≈ 16.7M pixels and lock the tab. Generators also keep a sane per-axis cap so no single map balloons toward the total.
- **Default `pixelCount` for a new 3D pattern: 512 (an 8×8×8 cube)** — interactive even under the Precise (fixed-point) renderer, the worst case. The cube generator derives the nearest lattice from whatever `pixelCount` is set.

### `loadPattern` + metadata: dimensionality becomes explicit

- The render-fn presence set **already exists** as `BundleMetadata.renderFns = { hasBeforeRender, hasRender2D, hasRender }` (the Acorn AST pass in `bundle()`, `bundle.ts`). The feature **extends it with `hasRender3D`** (a one-line addition to the existing `markRenderFn`/`RENDER_FN_NAMES` machinery) — it is *not* built from scratch.
- That presence set must be **threaded into `loadPattern`**: today only `BundleMetadata` carries `renderFns`, but `loadPattern` consumes the narrower `PatternMetadata`, which does not. Add `renderFns` to `PatternMetadata` (or pass it alongside) so the epilogue can build the right slots.
- `PatternHandle` (`src/engine/loadPattern.ts`) gains a **`render3D`** slot alongside `beforeRender`/`render2D`, and the epilogue builds the full fallback chain **`render3D → render2D → render → noop`** (extending the current `render2D → render` fallback).
- The presence set drives: **dispatch** is by the active layout's `sample`-arity through the fallback chain (§2); the pattern's **native** dimensionality (highest render fn) drives only the **default layout** on open and the **title-bar label**; the **"Shape" dropdown is filtered by `sample`-arity (pattern compatibility)** in v1, which for a 1D pattern admits 1D/2D/3D-*display* shapes (§5).

### The map as a first-class entity (stores + persistence)

Mirror the existing pattern infrastructure rather than invent a parallel one:

- **`pixelCount` and the map are separate first-class things (ADR-0004).** `pixelCount` is a modeled setting in its own right — on hardware a device software setting; in preview synthetic (user-chosen) but flowing through the pipeline identically. The render loop iterates `index = 0 … pixelCount-1` and asks the active map for each index's `sample`/`pos`. The map is purely an **index→position lookup**, never the authority on *how many* pixels there are. So line-127-era talk of "`pixelCount` = the map's point count" is **backwards**: the map *produces a position per index up to* `pixelCount` (`resolve(pixelCount) → MapPoint[]`).
- A **map store / slice** modeled on `src/store/patternStore.ts`: a library of maps plus an `activeMapId`, with CRUD actions. Today's global `GridConfig` in `previewStore.ts` becomes the **default seed** for a pattern with no stored selection (and the reveal-2D baseline) — a uniform 2D plane whose rows/cols/spacing are that map's generator parameters. It is no longer the per-pattern source of truth (it was historically "a single global grid"; that changes — see `CONTEXT.md` → *Preview grid*).
- **The layout selection is stored _per-pattern_, on `PatternRecord`** — `{ mapId, params, pixelCount, shapeId? }`, riding along exactly as `controls` already do (`storage.ts`). Reopening a pattern restores the map + count it was authored against ("returns to the cube you used"), and — for a 1D pattern — the **viewport shape embedding** it was wrapped in (`shapeId`: the line/ring/helix), so "a strip wrapped into an orbiting spiral" reopens as that spiral (ADR-0005). *This is the correction of the draft's `setSetting`/`LAST_ACTIVE_KEY` citation — that mechanism is a single global last-opened pointer, not per-pattern, and is the wrong tool here.* Adding optional fields to `PatternRecord` needs **no `DB_VERSION` bump** (IndexedDB records are schemaless; missing field → derive default from native dimensionality + the global grid seed on read). **Preview light size and `diffusion` stay global** viewport-comfort prefs (in `previewStore`, not per-pattern — and `diffusion` is hoisted out of `GridConfig` to sit beside light size, per ADR-0006); camera angle / orbit-paused state is **ephemeral** (not persisted — reset-view restores a known default, auto-orbit resumes on open).
- **Persistence** extends `src/engine/storage.ts`: a new `maps` IndexedDB object store alongside `patterns` (this *does* need a `DB_VERSION` bump 1→2 + `onupgradeneeded` branch), with `createMap`/`listMaps`/`getMap`/`updateMap`/`deleteMap` paralleling the pattern functions. Stock maps are built-in (generated, not persisted); only user maps (Phase 2) are written.
- **The map-introspection builtins flow from the active map.** `has2DMap`/`has3DMap`/`pixelMapDimensions`/`mapPixels` (today hard-coded always-2D over the grid in `shim.ts:155-171`) now report the active map's real dimensionality and iterate its points; `pixelCount` (today `grid.rows * grid.cols`, `shim.ts:156`) is sourced from the modeled `pixelCount`. The `ShimConfig` stops taking `grid` and takes the resolved map points + `pixelCount` + dimensionality. An integration touch in `src/engine/shim.ts` (both `createShim` and the `createFxShim` `mapPixels` override at `shim.ts:399`).

### Stock layouts: maps vs. shape embeddings

Two kinds of built-in layout, split by ADR-0005, surfaced through one "Shape" dropdown filtered by `sample`-arity:

- **Stock maps** — `resolve(pixelCount) → MapPoint[]`, owning both `sample` and a map-intrinsic `pos` (real geometry). **Committed Phase-1 set: plane (2D), volumetric cube (3D).**
- **Viewport shape embeddings** — 1D-only, pure `pos` generators `embed(index, pixelCount) → pos` over an empty `sample`. They live in the viewport, not `maps/`. **Committed Phase-1 set: line, ring.**

Everything below marked "if there's room" is explicitly optional, not a requirement.

- **1D (viewport shape embeddings):** **line** and **ring** (the two that cover the overwhelming majority of real 1D installs — strips and spinners). **Polygon (N sides)** is a cheap 2D-display add-on (1a if room). **Helix/spiral** is a **3D-display** embedding, so it rides **1b** with the orbit viewport (§5: a 1D pattern on a helix gets the 3D camera).
- **2D (stock map):** **plane / grid** (the existing preview grid, now a generated map; the default and the reveal-2D baseline). **Row-major only in Phase 1**, matching today's index order exactly so the 2D no-regression baseline holds.
- **3D (stock map):** **volumetric cube** (solid lattice — the default 3D layout, chosen because building in 3D usually means filling a volume). **Surface cube** and **sphere** are natural follow-ons.

**Wiring order (serpentine) is free in the model, deferred in scope.** Because index (list position) and `pos` (where drawn) are separate channels (§3), a serpentine/boustrophedon grid is just a generator that emits the same positions in a snaking index order — a trivial, additive follow-on. It is *not* in the committed Phase-1 set; Phase 1 ships row-major to preserve the no-regression baseline.

### Preview-pane UI — the final-form interface

The preview pane is a **WebGL viewport** plus a small control set. The controls that exist, and which ones show, are gated on the **active layout's display dimension** (§5) — 2D exposes the least, 3D the most. This describes the *finished* form; staging (which control lands in 1a vs. 1b) is in the Staging subsection.

**Always present (every dimension):**

- **"Shape" dropdown** — one control selecting the active layout, filtered by `sample`-arity (§5): a 1D pattern is offered line/ring/polygon/helix (its display dimension may exceed 1D); a 2D pattern gets the plane (and future 2D maps); a 3D pattern gets the cube. Underneath, 1D choices set a viewport embedding, 2D/3D choices set the map (ADR-0005) — but the user sees one knob.
- **Light size slider** ("Preview light size", §5 / ADR-0006) — display-only and pattern-invisible. Sets each drawn light source's diameter as a fraction of inter-dot pitch (f ≈ 0.15→0.95, default 0.5), growing the sources *in place* in 1D/2D/3D without moving positions or the layout's extent. Auto-fit-to-container (`Preview.tsx` `ResizeObserver`) still frames the cloud; light size only changes how large the sources are drawn within it.
- **Diffusion slider** — an isotropic blur merging the light sources (glow / light-bleed), meaningful in every dimension. Two invariants (ADR-0006): it never changes light-source size, and it never dims the field (energy-conserving; brightness alone changes brightness). Mechanism may differ per dimension so long as the feel is uniform.
- **Title-bar dimensionality indicator** — read-only in v1, reflecting the pattern's **native** dimensionality (the highest render fn — a pattern property, distinct from the display dimension a shape may push higher). A manual override to dispatch a multi-render-fn pattern at a lower dimension is the deferred nicety (§2).

**3D-display only (the orbit viewport — shows whenever the active layout draws in 3D, including a 1D pattern on a helix):**

- **Auto-orbit** — on by default: a slow azimuth turntable spin, so a freshly opened 3D layout presents itself from all sides without interaction.
- **Play/pause toggle** — explicitly arms/disarms the auto-orbit.
- **Drag to orbit** — click-drag on the WebGL canvas orbits the model. **Plain drag = turntable** (horizontal = azimuth, vertical = clamped elevation; "up" stays up, stable horizon). **Shift-drag = free trackball** (full rotation including roll). Grabbing the model **pauses auto-orbit**; it stays paused until the user re-arms it via the toggle (so holding a fixed viewing angle always works). Depth cueing (nearer dots larger/brighter) makes the orbit legible; additive blend means no depth sort.
- **Reset view** — one click back to the default angle (matters most after a Shift-trackball roll, which can leave the camera disoriented).
- **No scroll-dolly** — auto-fit frames the cloud and the light-size slider handles source scale; a separate camera-distance zoom is intentionally omitted (an easy future add if dense clouds prove fiddly).

**2D / 1D-flat views** expose only the always-present controls — no orbit, no rotation, no dolly (the camera is a locked orthographic top-down, equivalent to today's grid).

### Staging

- **1a — the architecture pivot, no 3D viewport.** Map concept in the stores; explicit-positions spatial layer (WebGL renderer + pure `camera.ts`) revealed **locked-2D**; the current grid re-expressed as the default stock 2D map; render-fn detection + native-dimensionality derivation; dispatch by active-layout `sample`-arity via the fallback chain; 1D **viewport shape embeddings** (line, ring; polygon if room) with path display on the WebGL canvas; the "Shape" dropdown; title-bar dimensionality; preview light size + diffusion as camera controls. **Ships looking like today's grid, plus real 1D.** This is the safe tracer bullet — a refactor whose 2D output should be *visually* unchanged (coordinate-identical; the draw moves Canvas-2D → WebGL).
- **1b — the third dimension.** Unlock the orbit viewport — **auto-orbit on by default** (slow azimuth turntable), **drag to orbit** (plain = turntable, Shift = free trackball), **play/pause** the auto-orbit (grabbing pauses it), **reset view**, depth cueing (nearer dots larger/brighter) — wire `render3D` through the handle and the loop; ship the volumetric-cube stock map and the **helix** 3D-display shape embedding (and surface cube / sphere if cheap). **Ships 3D preview.**

### Testing (Phase 1)

- **Stock-map generators** (pure functions): point counts (= `pixelCount`), ordering, normalization into 0..1, map-intrinsic `pos` for plane/cube.
- **Viewport shape embeddings** (pure functions): the ring/line `embed(index, pixelCount)` produces the expected `pos` path over an *empty* `sample` — validating the dual-sourced-`pos` split (ADR-0005) on the viewport side, and that a 1D pattern's `sample` is untouched by its shape.
- **Pure camera/projection module**: `pos` → clip coords, orbit matrix, depth scaling, fit-to-container, preview-light-size scale — including the locked-2D camera mapping the default grid to the expected screen layout (no canvas needed).
- **Dimensionality derivation**: given a pattern source, the correct `{render, render2D, render3D}` presence set and the native dimensionality (highest available).
- **Render dispatch**: the loop calls the render fn for the *active map's* dimensionality via the fallback chain `render3D → render2D → render → noop`, feeding the right `sample` length; 1D feeds index only.
- **No-regression on 2D**: the explicit-positions 2D path produces the same per-pixel `sample` coordinates the old grid loop did (`x = col/(cols-1)`), so existing pattern output is unchanged under reveal-2D. (This asserts coordinate identity, not canvas-pixel identity — the WebGL draw is only *visually equivalent* to the old Canvas-2D `arc()` output.)
- **Fidelity seam intact**: scalars still cross the boundary via `shim.encodeScalar` in both fast and Precise modes (ADR-0003 unaffected).
- React/preview wiring stays smoke-only per the project's testing conventions; the engine pieces (generators, derivation, dispatch) are the real test targets.

---

## Threading model *(analysis; deferred — main-thread stays for this feature)*

3D reopens the question ADR-0002 settled: should pattern execution leave the main thread? This section records the analysis so the future decision is pre-researched. **The conclusion for this feature is to stay on the main thread** — consistent with ADR-0002, with the spatial layer's "preserve the loop orchestration" promise, and with the project's defer-complexity stance. A worker is named as the designated *future* lever, with a concrete shape.

### What a worker does and does not buy

A Web Worker **relocates** pattern execution; it does **not accelerate** it. Same engine, same single core, same fixed-point shim cost — a 4,096-pixel volumetric cube under the Precise renderer hits the same per-frame compute either way. So a worker is **not a 3D-throughput fix**; that remains the job of the `pixelCount` cap and the small default 3D map. Its two prizes, **co-equal**, are both about *where* the work runs, not how fast:

- **Responsiveness** — the editor, controls, and var-watcher stay live while a heavy 3D pattern grinds; today a slow frame janks the whole UI.
- **A real watchdog** — the big one. ADR-0002 lists "an infinite/pathologically slow loop freezes the entire tab, forcing a reload; there is no watchdog (real hardware has one)" as an *unmitigated* consequence. A worker is terminable: a runaway pattern stalls the worker, and the main thread can `terminate()` it after a timeout and report "pattern stalled" — the watchdog hardware has and the preview lacks.

### The designated future architecture: one combined worker (config C)

Of the three ways to split the work, only one is worth banking:

- **(A) exec in worker, WebGL draw on main thread** — every frame ships a pixel-color buffer (up to 65,536 × RGB) back across the boundary. That is the per-frame `postMessage` cost ADR-0002 warned of. Transferable `ArrayBuffer`s make it zero-*copy* (double-buffered ping-pong), so it is survivable, but it is a crossing every frame. *Inferior fallback.*
- **(B) WebGL draw in a worker (OffscreenCanvas), exec on main thread** — backwards: it ships the pixel buffer *into* the worker each frame just to draw it, and the draw is already one cheap `gl.POINTS` call. **This is the direct answer to "can we thread the WebGL layer for a win?" — on its own, no.** Threading the draw alone buys nothing.
- **(C) exec *and* OffscreenCanvas draw together in one worker** — the whole hot loop (render fns → shim → projection → draw) lives in the worker; **pixel buffers never cross the boundary at all.** The only crossings are low-frequency: control changes and camera-orbit events *in*, var-watcher / FPS snapshots *out*. The per-frame `postMessage` cost simply evaporates. **The designated future architecture.**

So OffscreenCanvas is not a separate "thread the WebGL" win — it is the thing that makes an exec-worker clean. (B) and (C) show why: moved alone the draw is pointless; moved *with* exec it removes the boundary entirely.

### Why (C) needs no `SharedArrayBuffer` — and why that matters

`SharedArrayBuffer` requires cross-origin isolation (`COOP: same-origin` + `COEP: require-corp` response headers), which **GitHub Pages cannot set** (no custom headers without a service-worker header-injection hack). The deploy target therefore makes SAB effectively unavailable. Config (C) **does not need SAB**: transferables for any occasional bulk data and plain low-frequency messaging for control/watcher I/O suffice. SAB would only be *forced* by trying to keep control callbacks **synchronous** across the boundary — the unattractive path, and the variant (A) leans toward. This is a clean, deploy-grounded argument for (C) over (A).

### Cost of the move (why it is deferred, not free)

The honest price, beyond build effort: the engine's **synchronous, framework-free orchestration becomes message-passing async**, which is exactly the model ADR-0002 says the testing strategy depends on. The mitigation is already in place by design — the pure modules (`camera.ts`, the generators, the shim math, dimensionality derivation) stay synchronously unit-testable regardless of where they run; only the *orchestration* (`renderLoop`) goes async. That keeps the future refactor tractable, but it is real work touching the engine/UI seam, and it is not justified until the watchdog or 3D responsiveness genuinely bites. ADR-0002 remains the active decision; this is forward-looking analysis, not a commitment.

## Phase 2 — Custom maps *(deferred; captured)*

The offline-fidelity payoff: a user with a sophisticated real installation previews patterns against **their actual geometry**, not a stock approximation. Built on the exact same representation as stock maps — built-ins and customs are the *same kind of object* in the *same dropdown*; this phase adds creation, not a new system.

- **Authoring surfaces (one or both):**
  - **Coordinate import** — paste/upload an explicit point list (the simplest path; matches an exported real map).
  - **Map-function editor** — a small code surface where the user writes JS returning a coordinate array (`function(pixelCount){ … }`), matching how Pixelblaze maps are actually written. Evaluated via the same `new Function` path the pattern runtime already uses.
- **Save / name / manage** — persisted in the `maps` object store added in Phase 1; full CRUD in the map store (the `patternStore` CRUD is the template).
- Irregular/arbitrary topology is fully supported by construction (§4) — nothing in the Phase 1 representation assumes uniformity.

---

## Phase 3 — Controller map push/pull *(deferred; rides the Hardware Connectivity bridge)*

Make a workspace map deployable to, and readable from, a real device — as a **deliberate device-configuration action**, never part of routine pattern deploy (§6).

- **Push** — write a selected map to the device's single map slot. Guarded and explicit, because it overwrites the installation's physical-layout description (destructive if that map was measured by hand). Likely a confirmation + a clear "this configures the device, not the pattern" framing.
- **Pull / read-back** — import the device's current map into the IDE, so the preview reflects what's actually deployed. Arguably the safer and more useful first direction.
- **Transport** — reuses `PixelblazeConnection` and the local bridge from `Feature - Hardware Connectivity.md`; map read/write protocol support is a capability to confirm in that feature's Phase 2 spike. No new transport here.
- **Convenience composite (optional)** — "deploy this pattern *and* ensure the device's map is X," with eyes open that it touches physical-layout config.

---

## File / artifact layout

```
docs/
  prd/
    Feature - Pixel Maps & Dimensional Preview.md     (this doc)
src/
  engine/
    camera.ts          → NEW pure projection/orbit/depth/fit/light-size-scale
                         module (tested)                                          (Phase 1a/1b)
    renderer.ts        → rebuilt as a thin WebGL draw wrapper over camera.ts;
                         no-ops without a GL context; total-pixelCount cap        (Phase 1a; 3D in 1b)
    renderLoop.ts      → doTick inner loop: iterate pixelCount, read pos
                         (map.pos ?? shape.embed), dispatch by sample-arity
                         (orchestration preserved)                                (Phase 1a/1b)
    loadPattern.ts     → + render3D slot; fallback chain; renderFns threaded
                         into PatternMetadata                                     (Phase 1a/1b)
    bundle.ts          → renderFns presence set + hasRender3D (extend existing)   (Phase 1a)
    shim.ts            → ShimConfig takes resolved map + pixelCount + dim;
                         has*Map/pixelMapDimensions/mapPixels from active map      (Phase 1)
    storage.ts         → + `maps` object store (DB_VERSION 1→2) + CRUD;
                         PatternRecord gains { mapId, params, pixelCount, shapeId? } (Phase 1)
    maps/              → stock MAP generators — real geometry (plane, cube, …)    (Phase 1)
    shapes.ts          → NEW viewport SHAPE embeddings (1D pos-only: line, ring,
                         polygon; helix in 1b) — pure, no map (ADR-0005)          (Phase 1a/1b)
  store/
    mapStore.ts        → map library + activeMapId (mirrors patternStore)         (Phase 1)
    previewStore.ts    → GridConfig demoted to default seed; global light size +
                         diffusion (both viewport prefs); ephemeral camera state  (Phase 1)
  components/
    Preview.tsx        → WebGL canvas; "Shape" dropdown; 3D orbit controls
                         (auto-orbit, turntable, Shift-trackball, reset view)     (Phase 1a/1b)
    (shape UI)         → one "Shape" dropdown + title-bar dimensionality          (Phase 1)
```

(Phase 2 adds a custom-map authoring surface; Phase 3 adds map push/pull onto `PixelblazeConnection`. Neither is built in Phase 1.)

---

## Risks & open questions

- **Hardware normalization rule (per-axis vs aspect-preserving).** The preview normalizes per-axis, so aspect ratio is currently invisible to patterns. If firmware preserves aspect ratio, non-square maps would preview differently than they run — a fidelity gap on the very feature whose point is faithful preview. *Mitigation:* keep per-axis for now; characterise against a real device via the divergence harness (Hardware Connectivity) before committing the semantics; treat as documented divergence if confirmed.
- **3D performance is dominated by pattern execution, not drawing.** WebGL solves the draw layer (one `gl.POINTS` call, additive blend, no depth sort), so the spatial layer scales fine. The real risk is **layer 1**: a volumetric map runs the per-pixel JS render fn thousands of times per frame — worst under the Precise (fixed-point) renderer — and WebGL cannot help that (it is the existing ADR-0003 hot loop, unchanged). *Mitigation:* the 65,536 total-`pixelCount` cap, a small default 3D map (512), the dispatch guarantee that 2D patterns never compute a z, and the FPS readout as a live guardrail. A worse-than-expected Precise-mode 3D ceiling would be addressed by a lower 3D-specific cap, not by changing the renderer.
- **`pixelCount` / map-introspection migration.** Several builtins currently derive from the grid; re-sourcing them from the active map must not perturb existing 2D patterns. *Mitigation:* the reveal-2D no-regression tests assert identical 2D behaviour.
- **Layout ↔ pattern dimensionality mismatch.** A pattern may define multiple render fns, or none usable by the selected layout. *Mitigation:* dispatch by the active layout's `sample`-arity through the fallback chain `render3D → render2D → render → noop` (so there is always a defined-or-noop target); auto-pick the default layout from the pattern's native dimensionality (highest render fn) on open; filter the "Shape" dropdown by `sample`-arity (pattern compatibility) in v1 — which, because a 1D shape only sets `pos` (ADR-0005), still admits 1D/2D/3D-*display* shapes for a 1D pattern. *Semantic* cross-dimension override (dispatching a multi-render-fn pattern below its native) is a deferred nicety.
- **Persisted-state migration.** Three persisted surfaces move: (a) adding the `maps` IndexedDB object store needs a **`DB_VERSION` bump 1→2** + an `onupgradeneeded` branch; (b) extending `PatternRecord` with the per-pattern layout selection (`mapId`, `params`, `pixelCount`, and the optional 1D `shapeId`) needs **no bump** (schemaless records — missing fields default on read to native dimensionality + the global grid seed); (c) `previewStore.grid` is demoted from per-pattern source of truth to default seed. *Mitigation:* follow the existing `mergePersistedPreview` deep-merge discipline and the `onupgradeneeded` pattern in `storage.ts`; the reveal-2D no-regression tests assert existing 2D patterns are unperturbed.
- **Scope of built-in layouts.** Resisting the urge to ship many shapes. *Mitigation:* line + ring (viewport shapes) and plane + volumetric cube (stock maps) is the committed set; polygon/helix/surface-cube/sphere are explicitly "if there's room," not requirements.

---

## Build order

1. **1a — architecture pivot (no *visible* change to 2D):** render-fn detection in `bundle`/metadata → pure `camera.ts` + WebGL `renderer.ts` + `renderLoop.ts` inner loop (iterate `pixelCount`, read `pos` from map or viewport shape) revealed **locked-2D** → current grid re-expressed as the default stock 2D map → `PatternRecord` gains per-pattern `{ mapId, params, pixelCount, shapeId? }` → `mapStore` + `maps` object store → dispatch by active-layout `sample`-arity via fallback chain → 1D viewport shape embeddings (line, ring) + path display → "Shape" dropdown + title-bar dimensionality + preview light size + diffusion controls. **Checkpoint: 2D visually unchanged (coordinate-identical), real 1D works. Ship.**
2. **1b — 3D:** unlock the orbit viewport (auto-orbit + turntable/Shift-trackball drag + play/pause + reset view) + depth cueing (additive blend, no depth sort) → `hasRender3D` + `render3D` through handle + loop → volumetric-cube stock map at the 512-pixel default + helix shape embedding (+ surface cube / sphere if cheap). **Checkpoint: 3D preview. Ship.**
3. **Phase 2 — custom maps:** coordinate import and/or map-function editor → save/name/manage in the `maps` store.
4. **Phase 3 — controller map push/pull:** read-back first (safe), then guarded push, on the Hardware Connectivity bridge.

---

## Appendix A — the map data model (representative)

Illustrative shape, not a committed type. The split that matters (ADR-0005): the **map** always owns `sample`, and owns `pos` only when it is real geometry; a **viewport shape embedding** owns `pos` for cosmetic 1D shapes.

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
  // stock maps store their generator + params (re-derivable/editable);
  // custom maps (Phase 2) store an explicit points array.
  // resolve is handed pixelCount (ADR-0004 — the map does NOT own the count) and
  // returns one MapPoint per index, 0 … pixelCount-1.
  resolve(pixelCount: number): MapPoint[]
}

interface ShapeEmbedding {                            // viewport-owned 1D cosmetic shape: line, ring, polygon, helix
  id: string
  name: string
  displayDim: 1 | 2 | 3            // where it DRAWS (line=1, ring/polygon=2, helix=3); gates the viewport controls (§5)
  // pure pos generator over an empty sample — never touches what the pattern computes.
  embed(index: number, pixelCount: number): [number, number] | [number, number, number]
}
```

The render pipeline reads `pos` from whichever source applies:
`index → map.sample` feeds the pattern; `index → (map.pos ?? shape.embed(index, pixelCount))` feeds the camera.

Note on `dim` vs `sample.length`: they are not the same number. A 1D layout has `sample: []` (length 0) but may *display* in 1/2/3D (`shape.displayDim`); 2D has `sample` length 2; 3D length 3. `sample.length` is the mechanical coord count; the display dimension is what gates the viewport.

The key property: `sample` (what the pattern sees, map-owned) and `pos` (where it's drawn, dual-sourced) are **separate**. For a grid they coincide and both come from the map; for a 1D ring/helix `sample` is index-only and `pos` comes from a **viewport shape**; for a 2D-on-3D drape `sample` is a 2D unwrap and `pos` is a 3D map-intrinsic position. Phase 1 ships the coincident cases plus the 1D-ring case where they first diverge — now on the viewport side.
