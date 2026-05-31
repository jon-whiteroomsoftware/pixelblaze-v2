# Pixelblaze IDE v2 — System Reference

This document describes the Pixelblaze IDE **as it has actually been built**. It is
not a plan or a requirements list — for the "why" and the not-yet-built direction
see the PRDs under `docs/prd/`, and for individual decisions the ADRs under
`docs/adr/`. This reference is concerned with *what the system is and how it works*,
in successive levels of detail: a one-paragraph summary, then a feature map, then a
deep dive into each subsystem.

> Keep this current. When a change alters observable behaviour or the shape of a
> subsystem, update the matching section here. A pre-commit hook nudges you when
> `src/` changes land without a touch to this file.

---

## 1. Summary

The **Pixelblaze IDE** is a browser-based, offline-first development environment for
writing **Pixelblaze patterns** — small programs in Pixelblaze's JavaScript-derived
language that drive LED installations sold by [ElectroMage](https://electromage.com/).
It is a Vite + React single-page app with **no backend**: everything — editing,
transpiling, running, and previewing patterns — happens in the browser, with no
hardware controller required. It exists because the stock ElectroMage editor is a
primitive code box that needs a connected device and offers no code reuse. This IDE
adds a real editor (Monaco — autocomplete, signature hints, live error checking), a
**hardware-faithful preview** that renders 1D/2D/3D patterns on a configurable LED
map and can emulate the controller's exact 16.16 fixed-point arithmetic, a **library
system** for sharing reusable functions across patterns, and one-click export of a
flat, self-contained artifact you paste or upload to a real Pixelblaze. It is for
anyone building Pixelblaze patterns who wants to work fast and offline — and, with the
hardware-fidelity preview and ShaderToy porting toolkit, for people bringing GPU-style
shaders onto LEDs and needing to trust that what the preview shows is what the device
will do.

---

## 2. Feature map

Each feature below is detailed in §4+. This section is the orientation layer.

- **Offline single-page app.** Vite + React + TypeScript + Tailwind/shadcn, served
  statically. All computation is browser-side; the only network use is the optional,
  out-of-band hardware connectivity layer.
- **Engine / UI boundary.** A pure-TypeScript engine layer (`src/engine/`, no React)
  exposes functions and Zustand store slices; React components are thin wrappers.
- **Transpiler / bundler.** `bundle()` parses a pattern with Acorn, tree-shakes and
  inlines the library functions it references (transitively, across libraries),
  mangles names, and emits a single flat artifact valid for both browser eval and
  hardware upload — plus preview-side metadata and a second fixed-point emit.
- **Pixelblaze-dialect validator.** A pure two-pass checker (syntax parse + AST rule
  walk) surfaces parse errors and forbidden constructs (`let`/`const`/`class`/`new`/
  `switch`/`try`/`throw`/`import`) as live Monaco markers and a Good/Broken badge.
- **Runtime shim.** ~90 injected built-in functions and constants implementing the
  Pixelblaze surface (math, waveforms, color, palette, perlin, clock, transform
  stack, arrays, map introspection), with hardware-I/O and sensor globals as inert
  stubs.
- **Hardware-fidelity preview.** A 16.16 fixed-point emulation engine (the "Precise"
  renderer) reproduces the controller's overflow and precision; a float64 "Fast"
  renderer is the default smooth preview. Validated against a real device.
- **Pixel maps & dimensional preview.** The pixel map is a first-class entity. The
  preview renders 1D, 2D, and 3D patterns through one position + camera WebGL
  renderer, with a stock plane and cube map, 1D viewport shapes (line, ring, pole), and
  a 3D orbit camera with depth cueing that fits each model's bounding sphere.
- **Monaco editor.** Pixelblaze language mode, live validation, autocomplete and
  signature hints from a hand-maintained built-in manifest, a debounced push to the
  preview on clean compile, and a periodic auto-save tick.
- **Pattern management & storage.** IndexedDB-backed CRUD for user patterns, plus
  import of ElectroMage `.epe` files and "fork to edit" for read-only demos.
- **Pattern UI controls + var watcher.** Sliders, toggles, and HSV/RGB pickers driven
  by exported control functions; a live table of watched pattern vars and built-ins.
- **Libraries & demos.** Read-only `.js` libraries (`Anim`, `Color`, `Coord`,
  `Noise`, `SDF`, `Shader`) and a curated demo set, both loaded from disk at build
  time and openable in the editor.
- **Export.** Download or copy the transpiled flat artifact for hardware.
- **Hardware connectivity (out-of-band).** An isomorphic `PixelblazeConnection`
  module and a Node divergence/capability harness used to validate fidelity against a
  real controller. No in-app connection UI.

---

## 3. Architecture

### 3.1 Stack

| Concern | Choice |
|---|---|
| Build tool | Vite |
| UI | React + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Editor | Monaco (`@monaco-editor/react`) |
| Parser | Acorn (JS AST) |
| Pattern storage | IndexedDB (raw API) |
| Preview draw | WebGL (point cloud) |
| Tests | Vitest |
| Commit gate | Husky |

### 3.2 Engine / UI boundary

`src/engine/` is pure TypeScript with **zero React imports**: the transpiler,
validator, runtime shim, fixed-point engine, map generators, camera projection,
render loop, storage, and the hardware connection layer all live here and are the
primary test target. React components in `src/components/` and `src/App.tsx` call
engine functions and read Zustand stores; logic beyond rendering and event delegation
belongs in the engine. The boundary is enforced by convention (no framework imports in
engine files) and is what lets the tricky math (fixed-point ops, camera projection,
dependency resolution) be unit-tested without a DOM.

### 3.3 State (Zustand stores, `src/store/`)

| Store | Holds |
|---|---|
| `previewStore` | `isRunning`, `speed`, `brightness`, `grid` (rows/cols/spacing — derived from the active pixel count for 2D, not user-edited), `lightSize`, `diffusion`, `fidelity` mode, watch config + values, `fps`. Persisted (subset) to `localStorage` via `persist`. |
| `patternStore` | `activePatternId` / `activeLibraryName` / `activeDemoName` (mutually exclusive selection), `userPatterns` list, CRUD + layout-persist actions. |
| `editorStore` | `source`, `previewSource`, `compileStatus`, `isReadOnly`, `previewPatternName`, `patternVars`, `controls`, `nativeDim`, `displayDim`. |
| `mapStore` | `activeMapId`, `activeShapeId`, `activePixelCount`, `userMaps`; stock-map catalogue + resolution helpers. |
| `controlStore` | Current pattern UI control values (transient session state). |
| `cameraStore` | Ephemeral orbit camera angle, auto-orbit armed flag, and pole wrap density (`poleCols`) — never persisted. |

Each store exports its `*InitialState`; tests reset with `setState(initialState)`
(merge mode). `previewStore` persists only `brightness`, `speed`, `lightSize`,
`diffusion` (grid dims are derived from the count, not persisted) and deep-merges them
on load (`mergePersistedPreview`) so a stale blob
missing newer fields falls back to defaults rather than `undefined`. Notably,
**`fidelity` is transient** (defaults to `fast` each load) — per-pattern persistence
of the renderer choice is not yet wired.

---

## 4. Transpiler / bundler (`src/engine/bundle.ts`)

`bundle(patternSrc, libraries)` returns `{ code, fxCode, metadata }`.

- **`code`** — the flat hardware/preview artifact: every referenced library function
  inlined and prepended, every `namespace.fn()` call rewritten to `_namespace_fn`,
  `export` keywords preserved. This is exactly what runs on the device.
- **`fxCode`** — the fixed-point preview emit of `code` (see §8).
- **`metadata`** — preview-side companion (`BundleMetadata`), never sent to hardware.

**Parsing.** The pattern is parsed as an Acorn **module** (so top-level
`export var` / `export function` are legal); libraries are parsed as **scripts**.

**Metadata extraction** (`extractMetadata`) walks the top level and records:
- `exportedVars` — names of `export var` declarations (the user-visible globals).
- `patternVars` — *all* top-level var declarations, exported or not (the watcher can
  inspect any of them).
- `controls` — every exported function whose name starts with a control prefix
  (`slider`, `toggle`, `hsvPicker`, `rgbPicker`), as `{ exportName, kind, label }`.
  For pickers, `pickerVars` recovers the three backing top-level vars from simple
  `someVar = param` assignments in the body, so the UI can seed the swatch from the
  pattern's own initial values.
- `renderFns` — presence set `{ hasBeforeRender, hasRender2D, hasRender, hasRender3D }`,
  detected for both exported and non-exported declarations.

**Library resolution.** `collectLibraryRefs` finds every `lib.fn()` call where `lib`
is a known library filename. `resolveAllDeps` does a BFS from those seeds, pulling in
each function's transitive same-library calls *and* cross-library `otherLib.fn()`
references — so library A may call library B and only the reachable functions are
inlined (function-level tree-shaking, critical for the device's memory limits).
`inlineFn` renames each function declaration and rewrites its internal calls via
`mangle(ns, fn) → _ns_fn`. A pattern that references no libraries short-circuits and
returns its source verbatim.

The filename is the namespace: `Shader.js` exposes the `Shader.*` namespace. Libraries
are plain `.js` (Acorn parses them directly; the bundled artifact must be valid
Pixelblaze code), loaded eagerly via `import.meta.glob('./lib/*.js', '?raw')`
(`src/pixelblaze/libs.ts`).

---

## 5. Validator (`src/engine/validate.ts`)

`validateSource(source)` is a pure function returning `ParseError[]`:

1. **Syntax parse** — Acorn `{ ecmaVersion: 2020, sourceType: 'module', locations: true }`.
   On throw, returns a single error with the line/column and Acorn's `(line:col)`
   suffix stripped.
2. **AST rule walk** — a generic recursive walker collects *every* Pixelblaze
   violation (not just the first): non-`var` declarations (`let`/`const`), classes,
   `switch`, `new`, `try`/`catch`/`finally`, `throw`, `import`. Each carries a
   human-readable message and location.

`Editor.tsx` runs this on every change for editable (non-read-only) sources, converts
errors to Monaco model markers (severity Error, from the error column to end of line,
≥1 char wide), and sets `editorStore.compileStatus` to `good`/`broken`. Object
literals and closure-scope divergences are deliberately *not* flagged (not in the rule
set / not statically detectable).

---

## 6. Runtime shim & built-ins (`src/engine/shim.ts`, `src/engine/builtins.ts`)

### 6.1 The injected shim

`createShim(config)` builds the Pixelblaze built-in surface as a plain object that is
later injected as named parameters to `new Function(...)` (so nothing pollutes global
scope and the whole surface is mockable). `ShimConfig` carries the resolved active-map
points, the modeled `pixelCount`, the display `dimensions`, and a `getVirtualTime`
accessor. The shim returns a `ShimContext` exposing `builtins`, `capturedPixel()`,
`encodeScalar`/`decodeScalar` (identity here; meaningful in fixed-point mode),
`transformPoint`, and `getBuiltin`.

**Implemented** (float64 reference behaviour):
- **Color:** `hsv`, `hsv24`, `rgb` capture the current pixel into frame-scoped
  `captR/G/B`, read out by `capturedPixel()` after each render call.
- **Waveforms / interp:** `time` (virtual clock, repeats every `interval × 65.536 s`),
  `wave`, `triangle`, `square`, `mix`, `smoothstep`, `bezierQuadratic/Cubic`, `clamp`,
  `map`.
- **Math / constants:** the trig/exp/log/pow family, `frac` (truncate-based, matching
  hardware), `hypot`/`hypot3`, `mod` (floored), `min`/`max`, `random`, and `PI`,
  `PI2`, `E`, etc.
- **Palette:** `setPalette` (flat `[pos,r,g,b,…]`), `paint` (interpolating lookup).
- **Perlin:** `perlin` + `perlinFbm`/`Ridge`/`Turbulence` + `setPerlinWrap`, built on
  Ken Perlin's 2002 reference (explicitly **not** bit-identical to firmware).
- **PRNG:** `prng`/`prngSeed` (mulberry32 — algorithmically divergent from firmware).
- **Clock:** `clock*` read the local browser clock.
- **Coordinate transform stack:** `translate`/`scale`/`rotate`/`rotateX/Y/Z`/
  `translate3D`/`scale3D`/`transform`/`resetTransform`, implemented as a persistent
  4×4 CTM applied via `transformPoint` before each render call — these are **live**,
  not the inert no-ops the original main PRD deferred.
- **Map introspection:** `pixelCount`, `has2DMap`/`has3DMap`, `pixelMapDimensions`,
  `mapPixels` — all sourced from the active map / modeled count, not a hard-coded grid.
- **Arrays:** `array(n)` returns a `Proxy` that truncates float indices to ints and
  exposes both standalone (`arraySort`, `arraySum`, …) and method (`a.sort()`,
  `a.mutate()`, …) forms with Pixelblaze numeric semantics.

**Inert stubs** (defined so patterns don't throw, but do nothing): hardware I/O
(`analogRead`, `digitalWrite`, `digitalRead`, `touchRead`, `pinMode`, `readAdc`),
sensor-expansion globals (`frequencyData`, `energyAverage`, `accelerometer`, `light`,
`analogInputs`, `maxFrequency`, `maxFrequencyMagnitude`), and `nodeId`. Sound-/sensor-
reactive patterns run without error but produce no motion.

### 6.2 The built-in manifest

`builtins.ts` is the documentation/IDE source of truth (distinct from the runtime
implementations): `BUILTIN_FUNCTIONS` (name + parameter names + doc) and
`BUILTIN_CONSTANTS` feed Monaco autocomplete and hover, and `resolveSignatureContext`
walks backwards from the cursor to find the enclosing call and active parameter for
signature hints. It is maintained by hand against the ElectroMage language reference;
there is no firmware auto-sync.

---

## 7. Pattern loading & dimensional dispatch (`src/engine/loadPattern.ts`)

`loadPattern(code, metadata, builtins)` strips `export`, appends a generated epilogue,
and evaluates via `new Function(...builtinNames, body)(...builtinValues)`, returning a
`PatternHandle`:

```ts
{ beforeRender, render, render2D, render3D, getExports, controls }
```

The epilogue builds each render slot with a **fallback chain
`render3D → render2D → render → noop`**, so asking for a higher dimensionality than the
pattern defines transparently drops the extra coordinates. `getExports` is a live
closure re-reading every `patternVar` on each call (the watcher samples it per frame).
`controls` maps each control export name to its function (or a noop).

`nativeDimension(renderFns)` returns a pattern's **native dimensionality** — the
highest render fn it defines (`render3D`→3, `render2D`→2, `render`→1; default 2). That
drives only the default layout on open and the title-bar label, **not** per-frame
dispatch (which is driven by the active layout's sample arity — see §9).

---

## 8. Hardware-fidelity fixed-point engine

The preview can run a pattern in one of two numeric modes, chosen by
`previewStore.fidelity`:

- **Fast (default)** — `code` evaluated with the float64 shim. Smooth, good-enough.
- **Precise** — `fxCode` evaluated with the fixed-point shim. Reproduces the
  controller's 16.16 arithmetic: overflow, precision loss, bitwise semantics.

### 8.1 Representation & operators (`src/engine/fixedpoint.ts`)

Every pattern number is its **raw int32** = `round(value × 65536)`. The `fx` object
implements faithful 16.16 operators, confirmed against a real device (fw 3.67):

- `add`/`sub` wrap to int32 (`| 0`).
- `mul` computes the exact `(a·b) >> 16` via 16-bit limb decomposition (float64 alone
  overflows past 2⁵³); the only expensive op.
- `div` rounds `a×65536/b` (a documented sub-ULP divergence from the device's
  truncating divide for non-power-of-two divisors).
- `mod`/`frac` truncate (sign of the dividend), matching firmware.
- Bitwise ops (`and`/`or`/`xor`/`not`/`shl`/`shr`) **integer-coerce operands first**
  (`raw >> 16`, op, `<< 16`) — matching firmware's "bitwise over the integer part",
  e.g. `~2.5 → -3`. This also cancels the fixed-point shift-count-scaling trap.
- Comparisons return raw `1.0` (65536) or `0`.

### 8.2 Fixed-point emit (`src/engine/fxEmit.ts`)

`emitFixedPoint(code)` re-parses the bundled source and re-emits it so every numeric
literal becomes its raw int32, every operator becomes an `fx.*` call, array subscripts
truncate (`(i)>>16`), and `++`/`--` step by one whole unit (65536). Unknown node types
fall back to the original source text, degrading to untransformed float math rather
than crashing the preview.

### 8.3 Fixed-point shim (`createFxShim`)

Wraps the float shim at a per-function seam: numeric args are decoded raw→float, the
float built-in runs, and a numeric result is re-encoded float→raw. So a built-in's
*internals* run in float64 and only its result is quantized to the 16.16 grid — making
`sin`/`sqrt`/etc. precision-divergent but close, and `perlin`/`prng` algorithmically
divergent (documented). Arrays, palettes (`setPalette`), `mapPixels` callbacks, and
`transformPoint` get bespoke overrides because their elements are *already* raw and
must not be re-encoded. `fx` itself is exposed to the evaluated pattern (the emit
references `fx.*` directly). `encodeScalar`/`decodeScalar` become the real
`fx.fromFloat`/`toFloat`, so the render loop, controls, and watcher stay mode-agnostic
and convert only at the boundary.

### 8.4 Known divergences (accepted)

Two independent gaps remain even in Precise mode: **numeric** (closed by the fixed-
point engine) and **algorithmic** (`perlin`/`prng`/transcendental LUTs are different
algorithms than firmware, not reverse-engineered). The only constructs bit-identical
on both sides are pure integer arithmetic — which is why the `Shader` hash helpers are
built from integer ops, not `sin`/`perlin` (validated bit-identical on device, #113).

---

## 9. Pixel maps & dimensional preview

The pixel **map** is a first-class concept: an index → position lookup that supplies
where each pixel lives, decoupled from how many pixels exist. The preview renders 1D,
2D, and 3D through one position + camera pipeline.

### 9.1 Data model (`src/engine/maps/types.ts`)

- `MapPoint = { sample: number[]; pos?: [..] }`. **`sample`** (length 0/2/3) is what the
  render fn sees — always map-owned. **`pos`** is where the dot is drawn —
  *map-intrinsic* when the map encodes real geometry, *viewport-supplied* (a 1D shape)
  when absent.
- `PixelMap = { id, name, builtin, dim, resolve(pixelCount) }`. `resolve` is handed the
  modeled `pixelCount` (it does **not** own the count) and returns one `MapPoint` per
  index.

**Stock maps:** `plane` (2D, row-major, `sample` = `pos`, normalized per-axis to match
the legacy grid loop exactly — the 2D no-regression baseline) and `cube` (3D
`side×side×side` lattice, default side 8 = 512 pixels). Both are generated, never
persisted.

### 9.2 Viewport shapes (`src/engine/shapes.ts`)

For a 1D (`render`-only) pattern, the path the strip is drawn along is a pure display
choice (`sample` is empty), so it lives in the viewport, not the map. Shipped shapes
(`ShapeId` is `'line' | 'ring' | 'pole'`): **`line`** (display dim 1) and **`ring`**
(display dim 2) are pure `embed(index, pixelCount) → [x,y]` generators producing
normalized `pos`. **`pole`** (display dim 3) wraps the strip around a cylinder
(stacked rings, x-fastest) and is drawn in 3D via the orbit camera. Its draw
positions come from `polePositions(pixelCount, cols)` (the 3D channel), not the 2D
`embed`. A wrap-density slider sets `cols` (pixels per wrap); the diameter is derived
from the Cylinder pi-math so each surface cell stays square (`clampPoleCols` /
`poleMaxCols` keep it in the taller-than-wide regime, `defaultPoleCols` a long
~4.5:1). The pole is laid along the cube body diagonal so it reads askew. Wrap density
lives in `cameraStore` (`poleCols`, ephemeral); changing it re-derives positions live
without reloading the pattern.

### 9.3 The "Shape" dropdown routing (`src/engine/layout.ts`)

One control blurs two code owners (ADR-0005). `layoutOptions(nativeDim, source)`
filters layouts by sample-arity: a 1D pattern is offered **every shape** (all shapes
dispatch the 1D `render` regardless of their display dim); a 2D/3D pattern is offered
only maps whose `dim` matches. `selectionForOption` routes a shape choice to `shapeId`
and a map choice to `mapId`. `resolveLayoutSelection` restores a pattern's persisted
choice if still valid, else the dimension's default (line for 1D, plane for 2D).

### 9.4 Camera & projection (`src/engine/camera.ts`)

Pure, fully unit-tested, no DOM:
- **Locked-2D camera:** `projectIndex` maps a row-major index to clip space
  (coordinate-identical to the legacy `(col+0.5)/cols` grid); `projectPos` draws a 1D
  shape's `pos`.
- **Orbit camera (3D):** `OrbitCamera { azimuth, elevation, roll }`; `orbitRotate` /
  `projectOrbit` apply `Rz·Rx·Ry` and an orthographic projection; `fit3DScale` keeps
  the model's worst-case extent inside a margin. The extent is the model's actual
  bounding-sphere radius about the rotation centre (`modelHalfExtent`) — rotation-
  invariant, so the model fills the viewport at every angle without clipping and a
  thinner/shorter model (e.g. a short pole) zooms in further; `HALF_DIAGONAL` (the
  unit-cube corner) is the default when no model bound is supplied. `depthCue` makes
  nearer dots larger and brighter; `orbitDepthToClipZ` drives opaque depth-tested
  occlusion. Both take the same `halfExtent`. Drag math:
  `dominantAxis` + `applyTurntableDrag` (plain drag, single-axis, clamped elevation
  horizon) and `applyTrackballDrag` (Shift-drag, free tumble); `advanceAutoOrbit`
  spins the turntable.
- **Sizing:** `pointSize`/`point3DSize` anchor the drawn light-source diameter to the
  inter-dot pitch × `lightSize`; `diffusionBlurStdDev` derives the diffusion blur
  radius from pitch (per-dimension factors).
- **Caps:** `MAX_PIXEL_COUNT = 65,536` (the dimension-agnostic freeze guard, replacing
  the old per-axis 256 cap); `MAX_GRID_AXIS = 256` keeps any one generator axis sane.

### 9.5 WebGL renderer (`src/engine/renderer.ts`)

A thin WebGL draw wrapper over `camera.ts`. Draws all pixels as one `gl.POINTS` call;
the fragment shader discards outside the inscribed circle so points read as round LEDs.
- **2D/1D:** additive blending (`ONE, ONE`, order-independent — no depth sort), grid or
  shape positions rebuilt on change.
- **3D:** opaque depth-tested draw (nearer orbs occlude farther — so diffusion 0 reads
  as crisp distinct sources rather than a washed-out additive haze), positions/sizes
  re-projected through the live orbit camera each paint with per-vertex depth cueing.
- Degrades to a no-op renderer when there is no GL context (jsdom/tests), still
  tracking canvas size — exactly as the old Canvas-2D path did.

### 9.6 Persistence

`PatternRecord` carries an optional per-pattern layout selection `{ mapId, params,
pixelCount, shapeId }` (schemaless — no DB bump; missing fields default on read). A
`maps` IndexedDB object store exists for user maps (DB version bumped 1→2), with full
CRUD in `mapStore` — though **custom-map authoring UI is not yet built**, so only stock
maps are currently used. `lightSize` and `diffusion` are global viewport prefs in
`previewStore`; the camera angle is ephemeral in `cameraStore`.

---

## 10. Render loop (`src/engine/renderLoop.ts`)

`createRenderLoop(config)` orchestrates the per-frame work over `requestAnimationFrame`,
preserving the clock/fidelity/watcher integration regardless of dimensionality:

1. Scale `realDelta` by the playback speed; `clock.advance`.
2. `handle.beforeRender(encodeScalar(scaledDelta))`.
3. For `index` in `0 … pixelCount-1`: read the map point's `sample`, apply the
   transform stack via `shim.transformPoint`, and **dispatch by sample arity**
   (`≥3 → render3D`, `===2 → render2D`, else `render`) with the encoded index. Capture
   the pixel color.
4. `paint(pixels, brightness, dimmed)` → the WebGL renderer.
5. `onFrame` feeds the watcher and built-in sampling; `onFps` reports a ~500ms-windowed
   smoothed FPS.

Runtime throws are caught: the loop stops quietly and reports via `onError` (surfaced
as an overlay in the preview, and the run pill returns to paused) — there is no
dedicated compile-error path here; compile problems live only in the editor.
`renderPreviewFrame()` runs a single frame (delta 0) so a paused pattern still shows a
frozen image.

---

## 11. Preview pane (`src/components/Preview.tsx` + controls)

The preview pane is a WebGL viewport plus a small, dimension-gated control set.

- **Layout build.** On source/spacing/fidelity/layout change, the pane bundles the
  pattern, derives native dimensionality, resolves the active layout, builds the map
  points (1D shape embedding / 2D plane squared up from the pixel count / 3D cube
  lattice whose side is derived from the count), constructs the
  Fast or Precise shim, loads the handle, seeds the control UI from the pattern's own
  initialized vars (decoded from raw in Precise mode), and starts the loop.
- **Auto-fit.** A `ResizeObserver` derives `spacing` from the container width so the
  grid always fills the pane; light size scales only the drawn sources, never the
  canvas.
- **Run/pause.** The header pill toggles `isRunning`; the app starts running by default
  (`previewInitialState.isRunning = true`). Paused patterns dim and show a single
  frozen frame.
- **Controls** (`PreviewSettings.tsx`): brightness (0–1), **pixel count** (a single
  numeric input clamped to `MAX_PIXEL_COUNT`; the map arranges it — the stock plane
  squares it up, the stock cube cubes it — so there is no width×height knob), **preview
  light size** (`0.15–0.95`, default 0.5 — source diameter as a fraction of pitch),
  **diffusion** (0–1 blur merging sources), playback **speed** (`SpeedSelector`,
  0.1×–2× via the virtual clock), the **Shape** dropdown (`ShapeSelector`), and the
  Fast/Precise renderer toggle. A read-only `{n}D` native-dimensionality chip sits by
  the pattern name.
- **Diffusion** is rendered as an SVG `feGaussianBlur` in **linear light**
  (`linearRGB`), so it conserves energy and never dims (a CSS `blur()` in sRGB
  systematically darkened — the #75 regression). Radius scales with inter-dot pitch.
- **3D orbit viewport** (`OrbitControls.tsx`, shown when the active layout's display
  dim is 3): auto-orbit (on by default, an independent rAF decoupled from pattern
  play/pause), plain-drag turntable, Shift-drag trackball, reset view. Depth cueing +
  opaque draw make the orbit legible; no scroll-dolly.
- **Var watcher** (`WatchPanel.tsx`): a live table of selected pattern vars and
  built-ins (`elapsed`, `pixelCount`, …), refreshed each frame via `onFrame`, decoded
  from raw in Precise mode. Arrays show per element. A fixed readout always shows
  `fps`/`renderer`, and a read-only `layout` cell after `pixelCount` (W×H in 2D,
  W×H×D in 3D, none in 1D).
- **Pattern UI controls** (`ControlsPanel.tsx`): renders sliders / toggles / HSV / RGB
  pickers from `metadata.controls`; values live in `controlStore` (transient, reset on
  reload), encoded to the pattern domain before each callback. Unsupported control
  prefixes (`trigger`, `inputNumber`, `showNumber`, `gauge`) are ignored — the function
  still loads and runs, just without a widget.

---

## 12. Editor (`src/components/Editor.tsx` + `src/components/monaco/`)

Monaco in a Pixelblaze language mode (`pixelblazeLanguage.ts`) with completion and
signature-hint providers (`providers.ts`) backed by the `builtins.ts` manifest plus
all loaded library functions, and library hover cards (`LibraryHoverCard.tsx`,
`libDocs.ts`, `cheatsheets.ts`).

Two propagation paths matter and differ from the original PRD's single-tick design:
- **Preview push** is a **600ms debounce** on edit: when the source compiles cleanly,
  it is pushed to `previewSource` (which rebuilds the preview). Broken code is not
  pushed — the last clean version keeps running.
- **Auto-save** is a separate **4s interval tick** that writes clean source to
  IndexedDB.

Read-only files (libraries, demos) skip validation and clear markers. The model is
force-tokenized on mount and source swap to avoid a flash of un-highlighted text.

---

## 13. Pattern management & storage (`src/engine/storage.ts`, `src/App.tsx`)

- **IndexedDB** (`pixelblaze-ide`, version 2): `patterns`, `settings`, `maps` object
  stores. `PatternRecord = { id, name, src, controls, updatedAt, mapId?, params?,
  pixelCount?, shapeId? }`. CRUD helpers accept an injectable `IDBFactory` for tests
  (`fake-indexeddb`).
- **Selection** is tri-state: a user pattern, a read-only library, or a read-only demo
  (`patternStore`). The last-active selection is remembered in `settings`.
- **Create** writes a runnable starter (`newPattern.ts` — an animated hue gradient)
  immediately, so the auto-save tick has a target and the record persists pre-edit.
- **Rename / delete** user patterns; names need not be unique (`uniquePatternName`
  disambiguates), the `id` is identity.
- **Import** ElectroMage `.epe` files (`epeImport.ts` parses the JSON, takes
  `sources.main`) into a new user pattern — this is the "load pattern from disk"
  feature the main PRD deferred, now shipped.
- **Fork a demo** ("Edit" button) copies the read-only demo source into a new editable
  user pattern.

---

## 14. Libraries & demos

- **Libraries** (`src/pixelblaze/lib/`, read-only, openable): `Anim` (easing /
  oscillators / timing), `Color` (palette / blends), `Coord` (polar / transforms),
  `Noise` (value noise — hashes rewritten to be hardware-representable, #100), `SDF`
  (2D signed-distance fields + boolean ops), `Shader` (GLSL gap-fillers — `fract`,
  `step`, `sign`, `saturate`, `dot2/3`, `distance2`, `toUV`, `normalize2/3`, `rot2`,
  `reflect2/3`, `iqPalette`, and the bit-identical integer hashes `hash21`/`hash11`).
  Each library has a `*.fidelity.test.ts` asserting fast/Precise agreement.
- **Demos** (`src/pixelblaze/demos/`, read-only, forkable): shader-style ports
  (`Kishimisu`, `NeonSquircles`, `Caustics`, `PlasmaNebula`, `KaleidoBloom`,
  `ZippyZaps`, `IQPalettes`, `PhantomStar`), showcases (`ShaderShowcase`,
  `ControlsShowcase`, `GlowingOrb`, `EasedSweep`), and dimensional verify-by-eye
  patterns (`TestPattern1D/2D/3D`).

Both sets are loaded from disk at build time via `import.meta.glob(..., '?raw')`.

The **ShaderToy → Pixelblaze porting guide** lives at
`docs/guides/Porting ShaderToy shaders to Pixelblaze.md`.

---

## 15. Export (`src/App.tsx`)

- **Copy Code** — `bundle(source).code` (the flat transpiled artifact) to the clipboard
  for paste into the ElectroMage editor. Disabled while the compile is broken.
- **Download** — the same artifact saved as `<sanitized-name>.js` for upload to a
  controller. The fixed-point `fxCode` is preview-only and never exported.

---

## 16. Hardware connectivity (out-of-band; `src/engine/PixelblazeConnection.ts`, `test/`)

A framework-free, **isomorphic** connection module (injected WebSocket factory:
browser `WebSocket` or Node `ws`) speaking the controller's `ws://host:81` API. It is
**not** used by any in-app UI — from a GitHub Pages (https) deployment the browser
cannot reach a `ws://` device (mixed content), so the module exists to serve Node-side
tooling:

- **Phase 1 (shipped):** documented JSON API (`getVars`/`setVars`, ping, lifecycle) +
  the **divergence harness** (`test/divergence-harness/`, `npm run harness`) that
  sweeps a hand-loaded probe pattern against a real device and writes the committed
  divergence report that gates the fidelity engine. Unit-tested against a fake
  in-memory WebSocket (in the commit gate); the live tier runs out-of-band.
- **Phase 2 (spike landed, #108):** the binary-frame protocol — `listPrograms` decode,
  `getControls`/`setControls`/`brightness`/`activeProgramId`, and the undocumented
  chunked pattern-push (`putSourceCode`/byte code). The capability report records a
  bytecode-push GO on a proven path (#112).
- **Phase 3+ (not built):** a local bridge process + in-app connection UI — captured as
  direction only.

---

## 17. Limits, caps & numeric model (quick reference)

- **Float64 vs 16.16** — Fast renderer runs native float64; Precise runs faithful 16.16
  fixed-point (range ±32768, precision 1/65536, int32-wrap overflow).
- **Freeze guard** — `MAX_PIXEL_COUNT = 65,536` total; `MAX_GRID_AXIS = 256` per
  generator axis. Default 3D cube is 512 pixels (8³).
- **Main-thread execution** — patterns run on the main thread via `new Function()` +
  rAF; a syntactically valid infinite loop can still freeze the tab (no watchdog). The
  debounced clean-compile push reduces but does not eliminate this.
- **`time(interval)`** repeats every `interval × 65.536 s`; speed scales the virtual
  clock feeding `delta` and `time()`.

---

## 18. Testing

- Pure engine functions are the primary target (transpiler, validator, fixed-point ops,
  camera projection, map/shape generators, dimensionality derivation, storage). React
  components get smoke coverage only.
- Library fidelity tests (`*.fidelity.test.ts`) assert fast/Precise agreement per
  function. `fixedpoint.bench.ts` benchmarks the multiply hot path.
- The pre-commit hook runs `npm run lint && npm test`. The live hardware tier is
  excluded from the gate and run deliberately out-of-band.

---

## 19. Pointers

- **PRDs** (`docs/prd/`) — rationale + the not-yet-built direction:
  `Pixelblaze IDE v2 PRD.md`, `Feature - Hardware-Fidelity Preview & ShaderToy Porting.md`,
  `Feature - Pixel Maps & Dimensional Preview.md`, `Feature - Hardware Connectivity.md`.
- **ADRs** (`docs/adr/`) — 0001 (float64, superseded by 0003), 0002 (main-thread exec),
  0003 (fixed-point fidelity default), 0004 (pixelCount independent of map), 0005
  (display `pos` dual-sourced), 0006 (preview light size + diffusion).
- **Domain glossary** — `CONTEXT.md`.
- **Porting guide** — `docs/guides/Porting ShaderToy shaders to Pixelblaze.md`.
</content>
</invoke>
