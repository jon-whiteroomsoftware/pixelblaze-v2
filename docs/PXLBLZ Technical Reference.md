# PXLBLZ — Technical Reference

This document is for engineers working *on* PXLBLZ (or evaluating how it's built).
It covers the technology choices, the architecture, the engine internals, and — in
detail — the decisions made about how to faithfully interface with the Pixelblaze
ecosystem. It deliberately contains nothing about *using* PXLBLZ as a product
(see the **PXLBLZ Feature Guide** for that) and assumes you understand Pixelblaze
itself (see the **Pixelblaze Ecosystem Primer**).

> **Relationship to other docs.** This is the authoritative as-built description of
> the implementation (it replaced an earlier `docs/REFERENCE.md`), organised around
> *why it's built this way* and the Pixelblaze-interfacing decisions, and current as
> of the live-Controller arc (extension relay, in-app connection UI, pattern/map
> push and read-back — ADR-0014, §13), the per-pattern settings cascade (ADR-0013),
> the shell/volume maps (ADR-0012), and solidity (ADR-0011). The **ADRs**
> (`docs/adr/`) are the authoritative record of individual
> decisions; this doc summarises and connects them. Where any doc disagrees with the
> code, the code wins.

---

## 1. Technology stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Build / dev server | **Vite** | Fast HMR; static output deployable to GitHub Pages. |
| UI | **React + TypeScript** | Mainstream, typed; thin view layer over the engine. |
| Styling | **Tailwind CSS + shadcn/ui** | Utility styling; a few headless components. |
| State | **Zustand** | Framework-agnostic stores readable/writable from the non-React engine (render loop, etc.) — see §3. |
| Editor | **Monaco** (`@monaco-editor/react`) | Real IDE features (completion, markers, hovers). |
| Parser | **Acorn** | Standards JS AST; powers the transpiler, validator, and fixed-point re-emit. |
| Pattern storage | **IndexedDB** (raw API) | Offline, structured, no backend. |
| Preview draw | **WebGL** point cloud | One pipeline for 1D/2D/3D; per-source shader kernels. |
| Tests | **Vitest** | Fast; jsdom for light component smoke tests. |
| Commit gate | **Husky** | Runs `npm run lint && npm test` pre-commit. |

The overarching stance (ADR-0002/0003/0004): **offline-first, no
backend.** Everything — editing, transpiling, running, previewing — happens in the
browser. The single deliberate exception is the live-Controller connectivity layer
(§13) — additive, optional, and never required for authoring. It reaches a device
through a Chrome-extension relay (not a server), so even the exception runs no
backend of our own (ADR-0014).

---

## 2. The defining design decision: faithful fixed-point preview

The most consequential interfacing decision is that the preview **defaults to
emulating the device's 16.16 fixed-point arithmetic** (ADR-0003, superseding the
original float64-only stance of ADR-0001). The driver is shader porting: the common
GLSL hash idiom `fract(sin(p·12.9898)·43758.5453)` overflows 16.16 on hardware while
looking perfect in float64, so a float-only preview cannot reveal that bug class — it
would let a pattern pass preview and fail on the device, defeating the whole point.

This produces a **two-renderer model**, surfaced as a per-preview toggle:

- **Fast** — float64. The default for smooth editing.
- **Precise** — faithful 16.16. What the device actually does.

Critically, fidelity is a **preview-only second emit path**. The downloaded/copied
hardware artifact is plain unmodified code — the device does fixed-point natively, so
nothing is rewritten for it. The fixed-point machinery exists solely so the *browser*
can reproduce the device.

Two divergence classes are documented and accepted rather than chased (ADR-0003):
**transcendental precision** (`sin`/`sqrt`/… computed in float64 then quantized — a
small sub-ULP gap) and **algorithmic identity** (`perlin`/`prng`/`wave` are different
algorithms than firmware). Only **pure integer arithmetic** is bit-identical on both
sides — which is why the library hashes are built from integer ops (§11).

---

## 3. Engine / UI boundary

A hard split, enforced by convention and load-bearing for the test strategy:

- **Engine** (`src/engine/`) — pure TypeScript, **zero React imports**: transpiler,
  validator, runtime shim, fixed-point engine, map generators, shapes/surfaces,
  camera projection, render loop, storage, normals, and the whole Controller
  connectivity stack (provider seam, extension backend, relay socket, push/preflight
  /binding/map-push logic, view-models — §13). This is the primary test target; the
  tricky math and the transport-agnostic connectivity logic are unit-testable with
  no DOM (a fake relay emulates a device end-to-end).
- **UI** (`src/components/`, `src/App.tsx`) — React components that call engine
  functions and read Zustand stores. Logic beyond rendering and event delegation
  belongs in the engine.

### Zustand stores (`src/store/`)

| Store | Holds |
|---|---|
| `previewStore` | `isRunning`, `speed`, `brightness`, `lightSize`, `diffusion` (live working copies), `lightSizeSticky`/`diffusionSticky` (global-sticky baselines), `fidelity`, `watchPatternVars`, `watchValues`, `fps`, `elapsed`. Persists only `fidelity` + the two `*Sticky` baselines to `localStorage` (ADR-0013); the cascaded `speed`/`brightness` and the live `lightSize`/`diffusion` are seeded per-pattern by the resolver, not persisted here. |
| `patternStore` | tri-state selection: `activePatternId` / `activeLibraryName` / `activeDemoName`; `userPatterns`; `demoOverrides` (per-demo cascade layer-1 bag, keyed by demo name, ADR-0013); CRUD. |
| `editorStore` | `source`, `previewSource`, `compileStatus`, `isReadOnly`, `previewPatternName`, `patternVars`, `controls`, `nativeDim`, `displayDim`, `solidEligible`, `editorFlavor` (`'pattern' \| 'map'`). |
| `mapStore` | `activeMapId`, `activeShapeId`, `activeSurfaceId`, `activePixelCount`, `activeNormalizeMode` (Fill/Contain), `activeSolidity`, `userMaps`, stock catalogue. |
| `controlStore` | current pattern UI control values (transient). |
| `cameraStore` | ephemeral orbit angle, auto-orbit flag, pole wrap density (`poleCols`). |
| `controllerStore` | live-Controller connectivity (§13): keyed map of connected Controllers (IP → phase/nickname/installed-map dim), the active one, extension presence, last-connected IP (auto-reconnect), and the Send/preflight/push slices. Persists only the last-connected IP. |
| `controllerPanelStore` | the connected Controller's polled live slice: active program (+ program list), reported FPS, device `pixelCount`, installed-map point count, and the volatile panel-owned brightness + live controls. |

Zustand is chosen specifically because the **render loop and other engine code read
and write state outside React**. Each store exports `*InitialState`; tests reset with
`setState(initialState)` (merge mode). `previewStore`'s persist layer
(`mergePersistedPreview`) drops the legacy `grid` blob, the stale per-pattern
`brightness`/`speed`, and migrates `grid.diffusion` — and a pre-cascade blob's
live `lightSize`/`diffusion` — forward into the global-sticky baselines (ADR-0013).
The preview-wide grid is retired (ADR-0009; §8).

> **Per-pattern settings cascade (ADR-0013).** Effective preview settings resolve
> field-by-field through four layers, first hit wins: per-pattern override →
> recommended (curated patterns only) → user global-sticky (comfort prefs only) →
> developer default. The pure resolver is `resolveSettings` (`src/engine/resolveSettings.ts`)
> over the `Settings` vocabulary + `DEV_DEFAULTS` (`src/engine/settings.ts`); the
> store orchestration seam is `src/store/settingsCascade.ts` (`seedActiveSettings`
> on open, `writeCascadedOverride`/`writeHybrid` per control, `forkSettingsSnapshot`,
> `resetActiveSettings`, `hasActiveOverrides`). Layer-1 overrides live sparsely and are
> written only on genuine user manipulation: a **user pattern** stores them on
> `PatternRecord.settings`; a **demo** stores them in `patternStore.demoOverrides`
> (keyed by demo name, persisted under the `demoOverrides` settings-KV key — ADR-0013
> amendment), so a demo's tweaks survive a reopen and `writeHybrid` treats it like a
> pattern. `resetActiveSettings` clears whichever layer-1 bag is active (demo → reverts
> to recommended; user pattern → app defaults) and is offered (`hasActiveOverrides`)
> only when that bag is non-empty. `fidelity` is the one **pure-global** field — never
> cascaded, persisted as before.

---

## 4. Transpiler / bundler (`src/engine/bundle.ts`)

`bundle(patternSrc, libraries)` → `{ code, fxCode, metadata }`:

- **`code`** — the flat hardware/preview artifact. Every referenced library function
  is inlined and prepended; every `namespace.fn()` call is rewritten to `_namespace_fn`;
  `export` keywords are preserved. This is exactly what runs on the device, and the
  only thing Copy/Download emit.
- **`fxCode`** — the fixed-point re-emit of `code` (§5), preview-only.
- **`metadata`** — preview-side companion, never sent to hardware.

**Parsing.** The pattern is parsed as an Acorn *module* (legal top-level
`export var`/`export function`); libraries as *scripts*.

**Tree-shaking & inlining.** `collectLibraryRefs` finds `lib.fn()` calls;
`resolveAllDeps` does a BFS pulling each function's transitive same-library and
cross-library references; `inlineFn` renames declarations and rewrites internal calls
(`mangle(ns, fn) → _ns_fn`). Only reachable functions are inlined — function-level
tree-shaking, critical for the device's memory limits. A pattern referencing no
libraries short-circuits and returns its source verbatim. The filename is the
namespace (`Shader.js` → `Shader.*`); libraries are loaded eagerly via
`import.meta.glob('./lib/*.js', '?raw')`.

**Metadata extraction** records `exportedVars`, all top-level `patternVars`,
`controls` (exported functions matching a control prefix, as `{exportName, kind,
label}`, with `pickerVars` recovering the backing vars for colour pickers), and
`renderFns` (the presence set used for dimensionality).

This is a faithful interfacing choice: the artifact must be valid Pixelblaze code, so
libraries are authored in the Pixelblaze dialect (plain `.js`, Acorn-parseable) and
the bundler does only inlining/renaming, not language translation.

---

## 5. Fixed-point engine

Three pieces implement Precise mode:

### Representation & operators (`fixedpoint.ts`)

Every pattern number is its **raw int32** = `round(value × 65536)`. The `fx` object
implements 16.16 operators, confirmed against a real device (fw 3.67):

- `add`/`sub`/compare: native ops with `| 0` int32-wrap.
- `mul`: exact `(a·b) >> 16` via 16-bit limb decomposition (float64 alone overflows
  past 2⁵³) — the one expensive op.
- `div`: rounds `a×65536/b` (a documented sub-ULP divergence from the device's
  *truncating* divide, for non-power-of-two divisors only).
- `mod`/`frac`: truncate (sign of dividend), matching firmware.
- Bitwise: integer-coerce operands first (`raw >> 16`, op, `<< 16`), matching
  firmware's "bitwise over the integer part" (`~2.5 → -3`).

### Fixed-point re-emit (`fxEmit.ts`)

`emitFixedPoint(code)` re-parses the bundled source and re-emits it: numeric literals
become raw int32, operators become `fx.*` calls, array subscripts truncate
(`(i)>>16`), `++`/`--` step by one whole unit (65536). Unknown node types fall back to
the original source text — degrading to float math rather than crashing.

### Fixed-point shim (`createFxShim`)

Wraps the float shim at a per-function seam: numeric args decoded raw→float, the float
built-in runs, the numeric result re-encoded float→raw. So a built-in's *internals*
run in float64 and only its *result* is quantized to the 16.16 grid. The seam was
built so a firmware-matched LUT could replace an individual `fx.sin` if a divergence
ever proved visible — none has, so the hook is unused. Arrays, palettes, `mapPixels`
callbacks, and `transformPoint` get bespoke overrides (their elements are already
raw). `encodeScalar`/`decodeScalar` become `fx.fromFloat`/`toFloat`, so the render
loop, controls, and watcher stay mode-agnostic and convert only at the boundary.

---

## 6. Validator (`validate.ts`)

`validateSource(source)` is pure, returning `ParseError[]` via two passes: an Acorn
**syntax parse**, then an **AST rule walk** collecting *every* Pixelblaze violation
(not just the first): non-`var` declarations (`let`/`const`), classes, `switch`,
`new`, `try`/`catch`/`finally`, `throw`, `import`. `Editor.tsx` converts these to
Monaco markers and sets `editorStore.compileStatus`. This encodes the §4 language
limitations from the Ecosystem Primer as live feedback. Object literals and
closure-scope divergences are deliberately *not* flagged (not statically detectable
in the rule set).

### Editor propagation & map mode (`Editor.tsx`, `monaco/`)

Monaco runs in a Pixelblaze language mode (`pixelblazeLanguage.ts`) with completion
and signature-hint providers backed by `builtins.ts` plus all loaded library
functions, and library hover cards. Two propagation paths run on independent timers:

- **Preview push** — a **600ms debounce** (`PREVIEW_DEBOUNCE_MS`) on edit: when the
  source compiles cleanly it is pushed to `previewSource` (rebuilding the preview).
  Broken code is not pushed — the last clean version keeps running.
- **Auto-save** — a separate **4s interval tick** (`SYNC_TICK_MS`) writing clean
  source to IndexedDB.

The model is force-tokenized on mount and source swap (up to a 2000-line cap) to avoid
a flash of un-highlighted text; read-only files (libraries, demos) skip validation and
clear markers.

The editor has a second **map-authoring flavor** (`editorStore.editorFlavor === 'map'`,
`mapAuthoring.ts` + `MapModeHeader.tsx`) for writing custom `function(pixelCount)` map
sources — a JS surface with a **parse-only** badge (`parseMapSource` — Acorn parse of
`(${source})`, no dialect walker, no shim, since a map is just a JS function
expression). **New Map** opens on the `MAP_SKELETON` (a minimal valid 2D function, so
the buffer renders something immediately). A **"Load template"** dropdown
(`mapTemplates`) replaces the buffer with a stock map's *verbatim source text only*
(never its name or `dim`) — the **only** way to view stock-map code; a **dirty-guard**
(`isPristineToBaseline`) swaps silently while the buffer matches the last-loaded
baseline and confirms before clobbering edits. The source **auto-bakes** on the sync
tick when it parses (`bakeMapSource` — plain-JS `new Function`, float64, no shim;
aspect-preserving normalize per §8). **Deploy to preview** (`canDeployMap`) selects the
baked map as the active layout — enabled only when the bake is clean and its dim
matches the previewed pattern. The source bakes at the active `pixelCount` or, with
none set, `DEFAULT_MAP_BAKE_COUNT`; deploy never pins or overrides `pixelCount`
(ADR-0004). Eval failures surface in the header without crashing. `isMapOpenable` gates
which persisted records reopen (only those carrying `source` — i.e. custom maps, never
stock).

---

## 7. Runtime shim & built-ins (`shim.ts`, `builtins.ts`)

`createShim(config)` builds the Pixelblaze built-in surface as a plain object,
injected as named parameters to `new Function(...)` so nothing pollutes global scope
and the surface is mockable. It implements (float64 reference behaviour): colour
(`hsv`/`hsv24`/`rgb` capturing the current pixel), waveforms/interp (`time`, `wave`,
`triangle`, `square`, `mix`, `smoothstep`, beziers, `clamp`, `map`), the math/constant
family (`frac` truncate-based, `mod` floored, etc.), palette (`setPalette`/`paint`),
`perlin` + fractal family (Ken Perlin's 2002 reference — *not* bit-identical to
firmware), `prng` (mulberry32 — algorithmically divergent), `clock*` (reads the
browser clock), the **live coordinate transform stack** (a persistent 4×4 CTM applied
via `transformPoint`), map introspection (`pixelCount`/`has2DMap`/etc. sourced from
the active map, not a hard-coded grid), and a Pixelblaze-semantics `array(n)` Proxy.

**Inert stubs** (defined so patterns don't throw): hardware I/O (`analogRead`,
`digitalWrite`, …), sensor-expansion globals (`frequencyData`, `accelerometer`,
`light`, …), and `nodeId`. Sound/sensor-reactive patterns run without error but
produce no motion — a deliberate fidelity gap (the browser has no sensor board).

`builtins.ts` is a separate hand-maintained manifest (`BUILTIN_FUNCTIONS` +
`BUILTIN_CONSTANTS` + `resolveSignatureContext`) feeding Monaco completion/hover/
signature hints. It is maintained by hand against the ElectroMage language reference;
there is no firmware auto-sync.

---

## 8. Maps, embeddings, and the sample/position split

This is the richest interfacing area, and the one where the IDE's model has been
refined most (ADR-0004/0005/0007/0008/0009/0010/0011/0012).

### The core model

- **`pixelCount` is independent of the map** (ADR-0004). The render loop iterates
  `0…pixelCount-1` and asks the map for each index's position; the map is an
  index→position lookup, never the authority on count. This mirrors hardware, where
  `pixelCount` and the installed map are separate settings that can disagree.
- **Each map point has two channels** (ADR-0005): **`sample`** — the coordinates fed
  to the render fn, always map-owned — and **`pos`** — where the dot is drawn, which
  is *dual-sourced*: map-intrinsic when the map encodes real geometry, or
  *viewport-supplied* when the pattern leaves position free.

### Maps are source-backed plain JavaScript (ADR-0008)

A map function is **plain JavaScript run in the browser**, never the Pixelblaze
dialect and never run through the fixed-point shim — because that is exactly what
hardware does (the Mapper tab's function runs in *its* browser; only the baked
coordinate array reaches the device). Map evaluation is therefore **faithful by
construction**, with no divergence to characterise.

Hardware's Mapper accepts **two source formats** — a literal JSON array of
`[x,y(,z)]` coordinates, or a `function(pixelCount)` returning one — and authors in
**arbitrary real-world units** (the firmware derives the world extent from the
coordinates' limits, then normalizes to `0..1` per §8's Fill/Contain pass). The IDE
deliberately models **only the function flavor** (`function(pixelCount)`): it is the
superset (a static array is a trivial function body), it is what `parseMapSource`/
`bakeMapSource` evaluate, and every stock map is expressed that way. The raw-units
detail is invisible downstream — normalization erases the input scale, so a map
authored in millimetres and one in pixels with the same aspect bake identically.

Every stock map (`stockCatalogue.ts`) is a self-contained `function(pixelCount)` in
`src/engine/maps/sources/*.js` (`Math.*` and language built-ins only — pasteable into
a real Mapper tab), read raw via `import.meta.glob(..., '?raw')` and run through a
no-shim `new Function` primitive. The `.js` a user views *is* the `.js` the preview
runs — single source of truth, no parallel TS generator to drift. Stock maps
**regenerate live** for any count, so they never go stale.

The shipped catalogue (`STOCK_MAP_SPECS`): `plane` (label "Square"), `wide`
("Wide 2:1"), `seed-ring-2d` ("Ring") — 2D; and the 3D set, named by the **shell /
volume** scheme (ADR-0012): `cube` ("Cube (volume)"), `cube-shell` ("Cube (shell)"),
`star-shell`/`star-volume`, `seed-sphere-3d` ("Sphere (shell)"),
`sphere-volume`, and `tetra-shell`/`tetra-volume` (a four-sided die / d4). Shell
entries carry a `normals` recipe
(`'face' | 'star' | 'tetra' | 'centroid'`), whose presence is the solid-eligibility gate
(§9). A lattice entry carries a `grid` recipe (`'square' | 'wide' | 'cube'`),
which `createSourceMap` maps to the live count→dims derivation backing
`PixelMap.gridDims` — `plane`/`wide` to their plane dims, `cube` to its side³
dims; absent ⇒ `gridDims` returns null (the irregular clouds and shells).
The old wireframe `star` and the no-source "drape cylinder" are both retired.

### Custom maps bake on save (ADR-0007)

A custom map is evaluated **once** (float64, no shim) and its coordinate array frozen
into the `MapRecord`; `resolve(pixelCount)` *replays* that baked array index-aligned.
It does **not** re-run on a `pixelCount` change — reproducing the hardware "changed
pixelCount, forgot to re-save the Mapper" stale-map drift. A `MapRecord` carries
`source` (the editable JS), `points` (the bake), and `gridDims` when the points form a
regular lattice (for the layout readout). Baked replay applies to **custom maps only**
(stock maps regenerate).

### Aspect normalization: Fill / Contain (ADR-0009, amended #174)

A single shared pass maps raw geometry into `[0,1]`, in one of two modes — both real,
faithful Mapper behaviours, a **per-pattern** choice persisted on
`PatternRecord.normalize`, defaulting to **Contain**:

- **Contain** (`normalizeAspect`): aspect-preserving, longest axis → `[0,1]`, shorter
  axes proportionally smaller. The preview draws the true rectangle and the pattern
  reads true proportions.
- **Fill** (`normalizeFill`): each axis independently → `[0,1]`.

`applyNormalizeMode` re-stretches resolved Contain points to Fill live (no re-bake).
Applied identically to `sample` and `pos`. The map's resolved geometry is the **single
source of the preview's extent and aspect** — the old preview-wide `grid:{rows,cols}`
state is gone.

### Viewport embeddings: shapes (1D) and surfaces (2D)

An embedding owns `pos` while the map owns `sample` — the sample/position split,
spanning both dimensions (ADR-0010). All embeddings are pure `pos`-only generators.

- **Shapes** (`shapes.ts`, 1D): `line`, `ring` (pure `embed(index, count) → [x,y]`),
  and `pole` (a helix wound on a cylinder, drawn in 3D via `polePositions`, with a
  `cols` wrap-density slider in `cameraStore`). The shared π-cell wall math lives in
  `cylinderWall.ts`.
- **Surfaces** (`surfaces.ts`, 2D): `flat` (identity — the plain 2D preview) and
  `cylinder` (wraps the map's *raw integer* `gridDims` around a tube; `circumference:
  height = cols:rows`, so geometry is fully map-derived, no slenderness knob).

**Three embedding mechanisms, fixed by source-map arity** (ADR-0012): a 2D map can
only wrap onto a **developable** Surface (Flat or Cylinder — a sphere needs a
distortive projection, a cube net only takes square-per-face grids, so neither is a
Surface); a 3D map owns its geometry directly as a **shell** (points on a boundary,
solid-eligible) or a **volume** (interior fill, never solid-eligible).

### Layout routing (`layout.ts`)

Two orthogonal controls, not one union dropdown (ADR-0010): a **Map** control (owns
`sample`, filtered by sample-arity) and an **embedding** control (owns `pos` —
shapes for 1D, surfaces gated on the map's `gridDims` for 2D). `resolveLayoutSelection`
restores a persisted selection if still valid, else a default, optionally honouring a
demo's `recommendedMapId`. `LayoutSelector.tsx` hides a control with no real choice
(so a 1D pattern shows one, a 2D pattern with a wrappable map two, a 3D pattern one).

`resolveLayout(input, deps): ResolvedLayout` is the single seam from a Layout
*selection* to its **resolved layout** — the drawn realization. It folds together
selection-correction (`resolveLayoutSelection`), map/shape/surface resolution, the
shared aspect normalization, draw positions, solid-eligible surface normals, the modeled
`pixelCount`, and the `cols×rows(×depth)` readout label. The result is
`{ correctedSelection, mapPoints, pixelCount, displayDim, layoutLabel, draw }`, where
`draw` is a discriminated union — `{ kind:'2d', positions }` or
`{ kind:'3d', positions, normals }` (3D normals present ⇔ solidity-eligible). The
preview's render effect (`Preview.tsx`) is pure wiring over this: it writes
`correctedSelection` back to `mapStore`, surfaces `displayDim`/`layoutLabel`/`normals !==
null` to `editorStore`, and feeds `mapPoints`/`draw` to the renderer and render loop — it
holds no layout branching itself. To stay engine-pure (no store/React import, no import
cycle), `resolveLayout` takes its store-coupled lookups as injected `deps`
(`resolveMap`, `defaultCountForDim`); this is also what makes every branch
table-testable with fake maps (`resolveLayout.test.ts`). Both the cylinder wrap and the
`cols×rows(×depth)` readout label read the map's grid off the map itself —
`PixelMap.gridDims(count)` (stock generators derive it live, a custom lattice replays its
baked dims), so no `mapGridDims` provenance helper is injected. One rule, no id special-
cases: a map shows a label exactly when its `gridDims` is non-null — the Square/Wide 2:1
planes and the volumetric cube's side³ lattice do; shells and irregular clouds (Ring,
sphere shell) don't. Each branch's MODELED count runs through one selector,
`effectivePixelCount({ persisted, recommended, baked, fallback })` (`persisted ??
recommended ?? baked ?? fallback`, ADR-0004) — re-exported so the deck's editable count
box reads the same chain the renderer does, rather than open-coding it.

### Recommended settings (`demos.ts`)

Read-only demos carry no `PatternRecord`, so a single preview-only, IDE-side table
sets better on-open defaults: `RECOMMENDED_SETTINGS`, keyed by curated-pattern id, with
`recommendedSettingsFor(name)` the lookup (e.g. `AuroraSphere → { mapId:'seed-sphere-3d',
pixelCount: 4096, solidity: 1 }`). This is **layer 2** of the settings cascade
(ADR-0013) and collapses the three former sibling registries
(`DEMO_RECOMMENDED_MAPS`/`_PIXEL_COUNTS`/`_SOLIDITIES`) into one object holding any
subset of the cascaded fields. It sets the on-open default only; everything stays
switchable, and a user override outranks the recommendation. **None reaches the
pattern source, the artifact, or a controller** — the physical Pixelblaze knows only
patterns and maps, never associations.

---

## 9. Solidity & surface normals (ADR-0011/0012)

**Solidity** is a preview-only, *per-pattern* display property of any normal-bearing
embedding or shell map: a `0 = transparent → 1 = solid` slider that fades out
back-facing points so a solid object hides its own back. It is a **soft terminator
fade** — a `normal · viewDir` brightness multiplier folded into `project3D` beside the
depth cue (front-facing points are never touched; the slider sets the floor the back
fades to). At `0` the multiplier is uniformly `1` (today's see-through draw,
bit-identical).

Eligibility is **the presence of a per-point normal**, and is **provenance-gated, not
geometry-inferred**: the IDE supplies a normal only because it owns the generator —
analytic embeddings (Cylinder) emit it from their formula, faceted shells
(Cube/Star/Tetra shell) emit per-face normals, a convex shell (Sphere) re-derives
`normalize(pos − centroid)` *because the catalogue entry tags it with a `normals`
recipe* (`'face' | 'star' | 'tetra' | 'centroid'`); the resolver maps that tag to the
derivation (`NORMAL_FNS` in `layout.ts`), so no map-id strings leak into it.
A hand-imported sphere-shaped cloud carries no recipe and is never solid-able. Normals
(`centroidNormals.ts`, `starGeometry.ts`, `tetraGeometry.ts`) are preview-only — **never** stored in a map
or sent to a controller (a Pixelblaze map is positions only). Solidity persists on
`PatternRecord.solidity` (default `1.0`) and `editorStore.solidEligible` gates whether
the deck shows the slider.

---

## 10. Pattern loading, render loop, and WebGL

### Loading (`loadPattern.ts`)

`loadPattern` strips `export`, appends a generated epilogue, and evaluates via
`new Function(...builtinNames, body)(...builtinValues)` → a `PatternHandle`
(`beforeRender`, `render`, `render2D`, `render3D`, `getExports`, `controls`). The
epilogue builds each render slot with a fallback chain
**`render3D → render2D → render → noop`**, so asking for a higher dimensionality than
defined transparently drops extra coordinates. `nativeDimension(renderFns)` returns
the highest render fn defined (drives default layout + title label, **not** per-frame
dispatch).

### Render loop (`renderLoop.ts`)

Per `requestAnimationFrame`: scale `realDelta` by playback speed and advance the
virtual clock; `beforeRender(encodeScalar(scaledDelta))`; then for each index, read
the map point's `sample`, apply the transform stack, and **dispatch by sample arity**
(`≥3 → render3D`, `===2 → render2D`, else `render`); capture the colour; `paint(...)`;
report watch values and a ~500ms-smoothed FPS. Runtime throws are caught — the loop
stops quietly and reports via `onError` (an overlay; run pill returns to paused).

### WebGL renderer (`renderer.ts`)

A thin WebGL wrapper over `camera.ts`. All pixels draw as one `gl.POINTS` call; the
fragment shader renders a per-source kernel — a solid round core plus an optional
raised-cosine (Hann) glow tail — discarding outside the inscribed circle.

- **Diffusion** is a per-source point-spread, not a frame blur (ADR-0006).
  `diffusionGlow(diffusion, coreDiameterPx, pitchPx)` returns the grown quad size, a
  dissolving `coreFrac`, and an overlap-normalised `peak` so the field never dims or
  blows out. As diffusion → 1 the solid core dissolves into one smooth bump.
- **2D/1D**: one additive pass (order-independent). A single `pos` channel feeds the
  plane, rings, clouds, and 1D shapes; the canvas is sized to the layout's bounds
  aspect.
- **3D**: an opaque depth-tested core pass (nearer orbs occlude farther — crisp at
  low diffusion, no washed-out haze) plus an additive glow-tail pass into the gaps.
  The solidity terminator fade and depth cue ride here.
- Degrades to a no-op renderer with no GL context (jsdom/tests).

### Camera (`camera.ts`)

Pure, fully unit-tested. A **locked-2D camera** derives extent/aspect from the
layout's `pos` bounds (`posBounds2D`, `canvasSizeForBounds`, `projectPosInBounds` with
half-cell inset). An **orbit camera** (`OrbitCamera{azimuth,elevation,roll}`) applies
`Rz·Rx·Ry` + orthographic projection; `fit3DScale`/`modelHalfExtent` keep the model's
rotation-invariant bounding sphere in frame; `depthCue` and the solidity terminator
size and shade per-vertex. Caps: `MAX_PIXEL_COUNT = 65,536` (freeze guard),
`MAX_GRID_AXIS = 256`.

---

## 11. Libraries, demos & the porting toolkit

**Libraries** (`src/pixelblaze/lib/`, read-only, openable, authored in the Pixelblaze
dialect): `Anim`, `Color`, `Coord`, `Noise`, `SDF`, `Shader`. Each has a
`*.fidelity.test.ts` asserting Fast/Precise agreement.

**Demos** (`src/pixelblaze/demos/`, read-only, forkable): shader ports, showcases, and
per-dimension test patterns. Loaded from disk at build time via `import.meta.glob`.

**ShaderToy porting toolkit** (`Shader` lib + the porting guide), sequenced *after*
fidelity because a port is only worth doing if it survives upload. Key interfacing
decisions:

- **No re-polyfilling.** `mix`/`smoothstep`/`clamp` are Pixelblaze built-ins with
  GLSL-matching signatures, so `Shader` fills only genuine gaps.
- **`frac` vs `fract`.** Pixelblaze `frac` truncates; GLSL `fract` floors. They
  diverge for negatives, so `Shader.fract` is a distinct floor-based name, never a
  shadow of the built-in.
- **Integer-only hashes.** Because only pure integer arithmetic is bit-identical
  preview↔hardware, `hash21`/`hash11` are built from integer ops, not the overflowing
  `fract(sin(p·…)·…)` idiom. The fidelity hashes demote with `/ 256 / 256` (power-of-
  two, bit-exact) rather than `× 1/65536` (which the firmware number parser flushed to
  raw 0). Validated bit-identical on a real device (#113).
- **Out of scope** (the guide's "Won't port" table): textures/`iChannel`, multipass
  feedback, `dFdx`/`fwidth`, `discard`, MRT, and GLSL→3D porting. Automated GLSL
  rewrite is a non-goal.

---

## 12. Storage & pattern management

**IndexedDB** (`pixelblaze-ide`, version 2): `patterns`, `settings`, `maps` object
stores. `PatternRecord` carries the per-pattern preview overrides in a sparse
`settings?: Partial<Settings>` field — **layer 1** of the settings cascade (ADR-0013),
superseding the older flat `mapId`/`shapeId`/`surfaceId`/`pixelCount`/`solidity`/
`normalize` columns. `migratePatternRecord` lifts a pre-cascade record's flat fields
into the nested `settings` bag on read, and still rewrites retired ids (the ADR-0012
`surface-cube` → `flat`, `star` → `star-shell`) — schemaless throughout, so no DB
bump. Overrides are written sparsely and only on genuine user manipulation
(`updatePatternSettings`, a sparse merge that does **not** bump `src`/`updatedAt`);
`resetPatternSettings` clears them. `MapRecord` carries `source`/`points`/`gridDims` (§8).

Selection is tri-state (pattern / library / demo). **Create** writes a runnable
animated starter immediately. **Import** parses `.epe` JSON (`epeImport.ts`, takes
`sources.main`) into a new user pattern. **Fork** copies a read-only demo into an
editable pattern, snapshotting the demo's *effective* settings into the new record's
`settings` as frozen layer-1 overrides (everything except pure-global `fidelity`) — a
frozen copy with no live pointer back to the demo (`forkSettingsSnapshot`, ADR-0013).
CRUD helpers accept an injectable `IDBFactory` for tests (`fake-indexeddb`).

---

## 13. Live Controller connectivity (ADR-0014)

The IDE can connect to a **real Pixelblaze** and mirror/drive it live: a status
surface, a live panel, and **Send to Controller** for patterns and maps. The whole
stack sits behind one provider seam (ADR-0014), so no UI imports a transport.

### The constraint that shapes everything

From an **https** GitHub Pages deployment the browser cannot open `ws://<LAN-IP>:81`
directly — mixed *active* content, blocked outright (Ecosystem Primer §7). So a helper
outside the browser sandbox must relay. The v1 helper is a **Chrome extension**
(ADR-0014, superseding the Node "local bridge" originally
anticipated): the page cannot reach the device, but the extension's service worker can.

### The isomorphic protocol core (`PixelblazeConnection`)

A framework-free, **isomorphic** `PixelblazeConnection` (injected `WebSocketLike`
factory) speaks the documented JSON + binary protocol on `ws://host:81`. It is the
shared engine across every transport — Node `ws` for tooling, browser `WebSocket`, or
the extension relay — because each is just a different `WebSocketLike`. It still serves
the original Node-side tooling:

- **Phase 1:** the documented JSON API + the **divergence harness**
  (`test/divergence-harness/`, `npm run harness`) that sweeps a probe pattern against
  a real device and writes the committed divergence report gating the fidelity engine.
  Unit-tested against a fake in-memory WebSocket (in the commit gate); the live tier
  runs out-of-band.
- **Phase 2:** the binary-frame protocol — `listPrograms` decode,
  `getControls`/`setControls`/`brightness`/`activeProgramId`, and the *undocumented*
  chunked pattern-push. The capability report records a bytecode-push GO on a proven
  path (#112).

### The provider seam (`ControllerProvider`)

`ControllerProvider` (`src/engine/ControllerProvider.ts`) is the **firewall** that
contains the entire "how do we reach a Controller" decision (ADR-0014). It exposes
`connect`/`disconnect`, a `ControllerStatus` subscription (a discriminated union:
`no-extension | extension-present | connecting | connected | error`), the read/monitor
surface (`getConfig`, telemetry, `listPrograms`, `getControls`/`setControls`,
`brightness`, `setPixelCount`), and the capability-gated `compile`/`pushBytecode`/
`getPixelMap`/`pushPixelMap`. **The app imports only this module and its types** —
never an extension API, `PixelblazeConnection`, or `RelayWebSocket`. A
`NullControllerProvider` (permanently `no-extension`) lets the whole UI render against
the seam before any backend is installed. The `controllerProviderRegistry` holds the
*active* provider (what the panel and Send drive) plus a per-IP *factory* and a global
extension `detect` — `main.tsx` installs the real ones, tests inject fakes.

### The extension backend (`ExtensionControllerProvider`, `RelayWebSocket`)

The v1 backend owns a `PixelblazeConnection` whose socket is a `RelayWebSocket` — a
`WebSocketLike` proxy that tunnels frames across a `window.postMessage` →
content-script → service-worker seam to a real `ws://` socket living in the extension.
Because it satisfies the same `WebSocketLike` as the browser/Node sockets, **the entire
protocol engine drives it unchanged** — the relay adds transport, not protocol. Binary
frames cross the seam as base64 (`chrome.runtime` messaging is JSON-only).
`windowRelayTransport` is the one module that touches `window`; everything above it is
transport-agnostic and unit-tested with a fake relay that emulates a device end-to-end.
The extension itself (`extension/`: manifest, `background.js` service worker owning the
sockets, `content.js`, an offscreen-hosted sandbox) stays entirely on the far side of
the seam. The provider adds the extension-present handshake (`detectHelper`), the status
state machine, a keepalive ping, a **liveness watchdog** (declare the device gone after
~4s of inbound silence even with no socket close), and bounded auto-reconnect (MV3 can
evict the service worker; a powered-off Controller is expected back, so it keeps
probing).

### Per-IP just-in-time host permissions (ADR-0015)

The extension must reach `ws://<LAN-IP>:81` and `http://<LAN-IP>/…` (compiler fetch,
`/pixelmap.dat` read-back) at *runtime-discovered* IPs, but Chrome match patterns can't
express "the local network" (no CIDR, no partial octets) and a static broad
`ws://*/*` + `http://*/*` grant reads as a network-sniffing surface that fails Web Store
review (#229). So the LAN reach lives in **`optional_host_permissions`**, granted **per
device IP, just-in-time** (ADR-0015). Only `https://discover.electromage.com/*` is a
required host permission — discovery must work before any device IP is known. When the
app connects to an IP not yet granted, the service worker opens the extension's action
popup (`chrome.action.openPopup()`), which calls
`chrome.permissions.request({ origins: ['http://<ip>/*', 'ws://<ip>/*'] })`; Chrome's
native *"Allow access to `<ip>`?"* dialog is the actual grant. The popup batches all
discovered IPs into one request, so onboarding a fleet is a single dialog. The grant
gates **every** device-bound call (connect, compile fetch, map read-back), all of which
hit `http://<ip>`. The reconnect path must distinguish "socket failed" from "permission
missing for this (new) IP" — a DHCP reassignment re-triggers the popup rather than
silently retry-failing. The provider surfaces a declined grant as a typed
`ControllerPermissionDeniedError` so the store drops the half-created pill back to idle
instead of dwelling on it. The build is **distribution-agnostic**: the identical manifest
works from the Web Store or loaded unpacked.

### Auto-discovery (cloud, via the helper)

You can't reach a Controller you haven't typed an IP for, so the entry affordance
offers **Discover** alongside connect-by-address (#197, #206). The browser cannot find
devices on the LAN — **UDP beacon discovery is impossible from an MV3 extension**
(`chrome.sockets.udp` is a deprecated Chrome-*Apps* API; extensions get only
fetch/WebSocket/WebRTC, no raw UDP), so the reference clients' port-1889 beacon path
(Firestorm, pixelblaze-client) is closed to us. The only viable path is **cloud
discovery**, and only from the helper: `GET https://discover.electromage.com/discover`
matches Controllers by *public* IP and returns a JSON array of
`{ id, ip (WAN), localIp (LAN), name, version, … }`. The page can't read it — no CORS
header, the same wall as `ws://LAN` — but the extension service worker with a host
permission can (the same trick as the `/pixelmap.dat` read-back). `background.js` owns
the fetch (trims records, requires `id`+`localIp`); the result crosses the relay seam as
a `reqId`-keyed `discover`/`discover-result` round-trip (connection-independent — it
reuses the ambient detector provider, no Controller need be connected). The seam exposes
`discover()` on `ControllerProvider` (Null returns `[]`; any failure/timeout also `[]`),
maps `localIp` → connect `address` and `id` → stable key, and surfaces candidates in the
`ControllerBar` as clickable rows that drive the existing keyed `addController(address)`.
A discovered row carries its `name` into `addController` as a **seed nickname**, so the
pill is born named rather than flashing the bare IP until the device's config lands.
Discovery **runs automatically when the connect dropdown opens** and refreshes on a
periodic timer while it's open; a manual **rescan** affordance (spinner while in flight)
forces a fresh sweep, and already-connected Controllers are filtered out of the candidate
list (#228). This tracer bullet proves the cloud→helper→seam→UI→connect pipe; the full
multi-Controller list/select model is deferred.

### The in-app surface (status pills, panel)

- **Status + connect** live in the top-right `ControllerBar` (#210): one interactive
  **pill per connected Controller** (status dot folded *into* the pill — no standalone
  dot) plus one adaptive entry affordance whose dropdown adapts to extension presence.
  The pure view-models are `controllerStatusView` (the nav-tone vocabulary) and
  `controllerPillView`. Connection state is **keyed and multi-Controller** in
  `controllerStore`: extension presence is global, each Controller is keyed by IP with
  its own isolated provider/socket/reconnect, exactly one active; the last-connected IP
  alone auto-reconnects on reload. The dot tones are the shared traffic-light vocabulary
  (`StatusDot`): dark-grey *absent* (no extension), grey *idle*, **amber fast-blink**
  *connecting*, green *live*, red *error*.
- **The name is cached and sticky** (#215, #230). The store persists the last-connected
  IP *and* its nickname, so on reload the pill is born with the name rather than the bare
  IP. The name only ever *upgrades*: a fresh `getConfig` name wins (a device rename lands
  here), but a transient read that returns nothing must **not** clobber a known name back
  to the IP — both the live patch and the persisted value guard on "did we actually read
  a name." A discovery row and a same-IP reconnect both seed the pending pill from the
  known/cached name, so there is no point in the connect flow where a named Controller
  flashes its IP.
- **The live panel** is a pinned popover under the active pill (#211). `controllerPanelStore`
  polls (`CONTROLLER_POLL_INTERVAL_MS`, 1s) a small live slice; `controllerPanelView`
  renders it: the active pattern (id resolved to a name via program-list → local label
  cache → raw id, #237), reported
  FPS, the device `pixelCount`, the installed-map point count, and the live controls. On
  connect the panel is **warm-seeded** once (#225) so it opens populated rather than
  empty-then-jumping as the first poll lands.
  **Brightness is panel-owned and volatile** — seeded once from the device's first
  reported value, then slider-owned (later polls don't overwrite it), always `save:false`
  (flash wear). Control writes are likewise volatile.

### Send to Controller — pattern push (`pushPattern`, `controllerBinding`)

`compile`/`pushBytecode` are capability-gated (the H8 in-extension compiler spike,
#200, returned GO): the device's own compiler runs inside the helper's offscreen
sandbox (the only MV3-legal place to eval the remote compiler), turning source into
bytecode; `pushBytecode` sends it over the socket. `pushPattern` owns the *policy*, and
runs in one of **two modes** (#236):

- **Run-only** (today's default): compile, mint a *throwaway* program id, and load +
  run via `pushBytecode` — the firmware's `setCode`/`putByteCode`/`pause:false`
  sequence (the reference client's `sendPatternToRenderer`). The pattern runs but is
  **not persisted**: it never enters the device's Saved Patterns list and its id
  resolves to no name. The `setCode` name is sent **empty** (`name:""`, matching the
  reference): a name on a throwaway id would be a phantom — the display name lives in
  the local label cache instead (below, #237). Run-only deliberately does **not**
  consult or write the overwrite binding.
- **Save** (`persist: true`): compile, encode a **PBP blob** (`encodePbp`, `pbpEncode.ts`)
  — a 17-char id plus a 36-byte header of nine LE uint32s (version, then offset/length
  pairs for name/jpeg/bytecode/source) followed by the concatenated sections; the source
  rides as the firmware-required `{"main":<source>}` JSON container, LZString-compressed,
  and the preview JPEG is an empty section — and write it via `saveProgram`
  (`putSourceCode`, binary type 1, payload = id bytes + blob). This creates the `/p/{id}`
  record that shows in Saved Patterns with its name. Mirrors `PBP.fromComponents` /
  `PBP.toPixelblaze` in [pixelblaze-client](https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L2992).

**Overwrite-in-place** (`controllerBinding`) applies to **save mode only**, because only
a saved pattern enters the program list: each `(Controller, IDE pattern)` pair remembers
the device program id it last saved to and reuses it (a remembered id the user deleted on
the device is silently re-minted, detected against the live `listPrograms`). Run-only's
id never lists, so binding it would always miss and churn a fresh id every push — hence
the reframe. Control values are never in either push; the binding is identity only,
persisted in IndexedDB.

**Program label cache** (`withProgramLabel`, #237) is a *parallel* structure to the
overwrite binding, persisted under its own IndexedDB key and keyed by **device program
id** (not pattern id). Every push — run-only or save — records the pushed name against
the program id it landed on, so the panel can name a running program the device list
doesn't know. The panel resolves the active program's name in three tiers:
**program-list name → local label → raw id** (`resolveActiveProgramName`); a label-tier
hit is a run-only program the device hasn't saved, surfaced with an *unsaved* marker so
running-but-not-saved reads honestly instead of looking identical to a saved pattern.
The two stores stay separate deliberately: a run-only throwaway id must never clobber a
pattern's saved overwrite target, since they answer different questions ("what is this
program called?" vs. "which program do I overwrite for this pattern?").

`sendToController` is the pure
gate for the editor-header button: enabled only when a Controller is connected, the
pattern compiles, and — *when known* — its dimensionality matches the installed map
(an unknown map dim never blocks; a permanently-disabled Send would be worse). Before a
push, `preflight` reconciles the pattern's modeled pixel count against the device count
and surfaces a non-blocking, acknowledgeable warning (the push sends bytecode only and
keeps the device's existing map, so a mismatch is "this won't look right", not an error).

### Send map to Controller, and map read-back

A Pixelblaze stores **one shared map per device**, so a map push is a guarded
device-configuration act (always routed through the preflight dialog — never a silent
one-click), distinct from routine pattern deploy. `mapPush.ts` encodes the binary
`mapData` blob (mirroring `createMapData`/`setMapData` in pixelblaze-client
[`pixelblaze.py`](https://github.com/zranger1/pixelblaze-client/blob/9be84700248fa17f0123c702a2939213ba69800a/pixelblaze/pixelblaze.py#L1641)):
a 12-byte header of three LE uint32 `[formatVersion, numDimensions, bodyBytes]` then
each coordinate as a `formatVersion`-byte LE uint. **Deliberate divergence from the
reference:** our `points` are already firmware-normalized to `[0,1]` by the preview
layout (Contain/Fill, the user's per-map choice — ADR-0009), so we scale straight
through and only clamp, rather than re-running the reference's per-axis Fill stretch
(which would silently break aspect). What the preview shows is exactly what the device
receives.

Two firmware facts gate the rest:

- **The exact-count rule.** A pushed map must contain *exactly* `pixelCount`
  coordinates or firmware silently **drops** it — the frames report success but no
  visible change (#204); the reference client refuses to even parse such a map on
  read-back (`numElements != pixelCount → ValueError`). So `resolveMapPushPoints`
  **re-bakes the map source to the device `pixelCount`** before encoding (mirroring the
  reference `setMapFunction`, which calls the map function with `getPixelCount()`),
  conforming any map whose `function(pixelCount)` honours its argument. A hard-coded
  point count can't conform that way — the remedy is to set the device count to match,
  which is why the panel's **`pixels` row is editable** (`setPixelCount(n, save:true)`,
  #213). This is a *push-time* constraint, distinct from ADR-0004's post-hoc stale-map
  drift (changing `pixelCount` after a valid save).
- **Map read-back is an HTTP GET of `/pixelmap.dat`, not a WS call** (#205). There is no
  "get map" WS message (`putPixelMap` type 8 is send-only) and `getConfig` carries no
  map data, so the helper fetches the file over HTTP (the same helper that fetches the
  device compiler). `numPixels = bodyBytes / numDimensions / formatVersion` from the
  header, so even the map's point count is a cheap parse — surfaced beside the panel's
  `pixels` row so a count mismatch (the silently-dropped-map footgun) is visible.
  Read-back also unblocks the map *dimensionality* the Send gate uses. (The Fill/Contain
  **fit** mode, by contrast, is *map-bound* — saved with the map, not a standalone
  settings field — so it cannot be shown faithfully as a panel row from `getConfig`
  alone; it rides map read-back too.)
- **Reducing the count must black out the tail first** (#222, verified on hardware).
  WS2812s hold their last value until re-clocked and the device only clocks
  `pixelCount` LEDs, so after a reduction the LEDs beyond the new count freeze on
  their last colour. Nothing clears them as a side effect — *not* a `pixelCount`
  write, *not* a `putPixelMap`, and there is no per-pixel wire command (we confirmed
  the canonical Pixelblaze UI leaves them lit too). The only mechanism is to clock
  the whole strip black *while the count is still high*, then shrink:
  `applyControllerPixelCount` zeroes brightness (`save:false`), waits one full-length
  dark frame (~400 ms), writes the new `pixelCount` (`save:true`), then restores
  brightness — so the tail freezes black and the first N LEDs resume the pattern. It
  reads the restore brightness from `getConfig` and skips the blackout if that's
  unreadable (zeroing a brightness it can't restore would strand the strip dark).
  Both count-setting flows (the panel `pixels` edit and the map-push "set count only"
  remedy) go through this one helper. This is a deliberate, hardware-honest maneuver,
  not a preview invention — it does exactly what you'd do physically.

---

## 14. Export

- **Copy Code** — `bundle(source).code` to the clipboard. Disabled while compile is
  broken.
- **Download** — the same artifact as `<sanitized-name>.js`. The fixed-point `fxCode`
  is preview-only and never exported.

The artifact is the *only* thing that crosses to hardware. Metadata, the fixed-point
emit, the whole settings cascade (per-pattern overrides, recommended settings, light
size, diffusion, solidity, fidelity) all stay browser-side — the consistent rule that
**nothing the IDE invents for the preview ever reaches a controller.**

---

## 15. Testing

Pure engine functions are the primary target (transpiler, validator, fixed-point ops,
camera projection, map/shape/surface generators, normals, dimensionality derivation,
storage). React components get smoke coverage only. Library fidelity tests
(`*.fidelity.test.ts`) assert Fast/Precise agreement per function;
`fixedpoint.bench.ts` benchmarks the multiply hot path. The Husky pre-commit hook runs
`npm run lint && npm test`; the live hardware tier is excluded from the gate and run
out-of-band.

---

## 16. Known limits & accepted divergences

- **Float64 vs 16.16** — Fast is float64; Precise is faithful 16.16 (±32768,
  1/65536, int32-wrap overflow).
- **Algorithmic divergence** — `perlin`/`prng`/transcendentals are different
  algorithms than firmware (documented, not chased). Only pure integer arithmetic is
  bit-identical.
- **Main-thread execution** (ADR-0002) — patterns run via `new Function()` + rAF; a
  valid infinite loop freezes the tab (no watchdog). The clean-compile debounce
  reduces but doesn't eliminate this. A combined exec+OffscreenCanvas worker is the
  designated future lever (analysed in ADR-0002), deferred until the watchdog or 3D
  responsiveness genuinely bites.
- **Inert sensors** — sound/sensor-expansion globals are stubs; reactive patterns run
  but don't animate.
- **`fidelity` is pure-global by design** (ADR-0013) — the renderer is a
  machine/performance choice, never recommended and never per-pattern; it persists as
  one global value (superseding the old #90 "not per-pattern" framing).

---

## 17. Pointers

- **Feature guide** (using the IDE) — `docs/PXLBLZ Feature Guide.md`.
- **Pixelblaze ecosystem primer** (the platform itself) — `docs/Pixelblaze Ecosystem Primer.md`.
- **ADRs** — `docs/adr/` (0002 main-thread; 0003 fixed-point fidelity; 0004 pixelCount
  independence; 0005 sample/pos; 0006 light size + diffusion; 0007 bake-on-save; 0008
  map functions are plain JS; 0009 maps authoritative / Fill+Contain; 0010 surfaces;
  0011 solidity; 0012 shell/volume + three embedding mechanisms; 0013 per-pattern
  settings cascade; 0014 Controller via extension relay).
- **Domain glossary** — `CONTEXT.md`.
- **Porting guide** — `docs/guides/Porting ShaderToy shaders to Pixelblaze.md`.
