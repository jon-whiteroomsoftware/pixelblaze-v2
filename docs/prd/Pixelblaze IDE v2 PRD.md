# Pixelblaze IDE v2 — Product Requirements Document

## Terminology

**Pixelblaze** — A hardware controller for LED lighting sold by [ElectroMage](https://electromage.com/). Also refers to the broader ecosystem of hardware, firmware, and tooling ElectroMage provides.

**Pattern** — A small source file written in Pixelblaze's JavaScript-derived language that runs on a Pixelblaze controller. The word also refers to the resulting LED light display.

**Library** — A bundled set of reusable Pixelblaze functions, shipped with the IDE and maintained as read-only source files. Libraries are referenced using `libname.functionName()` syntax and are resolved by the transpiler before execution.

**Transpiled artifact** — The single flat JavaScript file produced by the transpiler. It is valid for both browser preview and hardware upload.

---

## Why

The built-in pattern editor provided by ElectroMage has three significant limitations:

1. Code editing is primitive — no modern IDE features (autocomplete, signature hints, error detection).
2. No offline mode — building and testing patterns requires a connected hardware controller.
3. No code reuse — every pattern must be self-contained; there is no library or shared-function mechanism.

---

## What

A **Vite + React single-page application**, served locally with no backend. All computation runs in the browser. There are no server-side APIs, no remote storage, and no network requirements during normal use. The server's only role is serving the static app files.

---

## Architecture

### Stack

| Concern | Choice |
|---|---|
| Build tool | Vite |
| UI framework | React + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State management | Zustand |
| Pattern editor | Monaco Editor |
| Transpiler parser | Acorn (JS AST) |
| Pattern storage | Browser IndexedDB (raw API) |
| LED preview | Canvas 2D |
| Test runner | Vitest |
| Pre-commit gate | Husky |

### Engine / UI separation

The engine (transpiler, runtime shim, eval loop, canvas renderer, storage) is a pure TypeScript module layer with **no React imports**. It exposes functions and Zustand store slices. React components only call engine functions and read from the store. This boundary is enforced by convention and verified by the absence of React imports in engine files.

### Validator design

`validateSource(source)` lives in `src/engine/validate.ts` as a pure function with no framework imports. It is the authoritative check run on every source change.

**Two-pass approach:**

1. **Syntax parse** — Acorn parses with `{ ecmaVersion: 2020, sourceType: 'module', locations: true }`. The `sourceType: 'module'` setting is required so top-level `export var` and `export function` declarations are accepted as legal syntax rather than rejected. If Acorn throws, one `ParseError` is returned immediately with the line and column stripped of Acorn's `(line:col)` suffix.

2. **AST rule walk** — if parsing succeeds, a generic recursive walker checks every node for Pixelblaze rule violations and collects all of them (not just the first). Forbidden constructs and their AST node types:

| Pixelblaze violation | AST node(s) |
|---|---|
| `let` / `const` | `VariableDeclaration` where `kind !== 'var'` |
| `class` / `extends` | `ClassDeclaration`, `ClassExpression` |
| `switch` / `case` | `SwitchStatement` |
| `new` | `NewExpression` |
| `try` / `catch` / `finally` | `TryStatement` |
| `throw` | `ThrowStatement` |
| `import` | `ImportDeclaration` |

**Monaco wiring** — `Editor.tsx` captures the editor and monaco instances via `onMount` refs. A `useEffect` on `source` runs `validateSource`, converts each `ParseError` to a Monaco model marker (severity Error, range from error column to end of line, minimum 1 character wide), and updates `editorStore.compileStatus`. Monaco's built-in hover renders the error message with no additional code needed.

**What is not flagged** — objects/named properties (`{ key: value }`) appear in the ElectroMage language limitations but are not in the PRD's violation list and are not flagged. Closure semantics (functions nested inside functions don't see the outer scope's locals on hardware) are a runtime divergence and are not statically detectable.

### Transpiler design

Library files are written as **global-scope flat functions** — no object wrappers, no ES module exports. The filename determines the namespace: `sdf.js` → `sdf` namespace.

User patterns reference library functions using dot notation: `sdf.circle(px, py, cx, cy, r)`. The transpiler:

1. Uses Acorn to parse the pattern source into an AST.
2. Detects all `namespace.fn()` call expressions where `namespace` matches a known library filename.
3. For each referenced function, uses Acorn to extract the function body from the library source.
4. Recursively collects transitive dependencies within the same library.
5. Mangles names to avoid collisions: `sdf.circle` → `_sdf_circle`.
6. Produces a **flat artifact**: all inlined functions prepended, all `namespace.fn()` calls rewritten to `_namespace_fn()`, `export` keywords preserved.

`bundle(patternSrc)` returns `{ code, metadata }`, not just a string. `code` is the flat artifact above — the single file used for both browser preview and hardware upload. `metadata` is a preview-side companion derived from the same AST pass: `exportedVars` (names of `export var` declarations → var watcher), `controls` (each exported control function as `{ exportName, kind, label }`), and `renderFns` (which of `render2D` / `beforeRender` are present). The metadata never reaches the hardware file — only `code` is downloaded or copied.

For browser eval, `export` is stripped by the runtime wrapper. For hardware upload, `code` is sent verbatim.

### Runtime shim

The browser runtime injects the Pixelblaze built-in functions and constants as parameters to a `new Function()` call. This avoids polluting the global scope and makes the shim fully injectable for testing. Built-ins are defined in a single manifest module (`builtins.ts`) that is the source of truth for three subsystems: the runtime shim (implementations), the editor autocomplete and signature hints (names + parameter names), and the reference validator (which names are built-in vs. unknown). The manifest is maintained by hand against the ElectroMage language reference — there is no auto-sync with the firmware.

`hsv(h, s, v)` and `rgb(r, g, b)` capture the current pixel's color as a side effect into a frame-scoped variable that the render loop reads after each `render2D(index, x, y)` call.

`time(interval)` is driven by a **virtual clock** that the render loop manages. The virtual clock scales by the playback speed multiplier, ensuring that `delta` and `time()` both reflect the user-configured speed.

The pattern is wrapped to return a live handle:

```ts
{
  beforeRender: (delta: number) => void,
  render2D: (index: number, x: number, y: number) => void,
  getExports: () => Record<string, unknown>,  // for var watcher
  controls: Record<string, Function>,          // slider*, toggle*, hsvPicker*, rgbPicker*
}
```

The runtime builds this handle from the transpiler's `metadata` without re-parsing: it strips `export`, appends a generated epilogue that returns the handle object, and evaluates via `new Function(...builtins, body)`. `getExports` is generated as a **live closure** over the evaluated scope, so each call re-reads the current values of the exported vars — the var watcher samples it after every rendered frame rather than getting a one-time snapshot.

### Built-in coverage (v1)

The built-in surface (~80 functions and constants) is implemented in tiers:

- **Fully implemented:** math, trig, waveform, interpolation, and noise functions (`sin`, `clamp`, `wave`, `triangle`, `mix`, `smoothstep`, `perlin*`, …); all constants (`PI`, `PI2`, `E`, …); per-pixel color (`hsv`, `hsv24`, `rgb`); palette (`setPalette`, `paint`); pixel-map introspection (`has2DMap`, `pixelMapDimensions`, `mapPixels`) over the configured preview grid; clock functions (read from the browser clock). `array(n)` is implemented, returning a native JavaScript array.
- **Inert stubs** (defined so patterns don't throw a reference error, but do nothing): hardware I/O (`analogRead`, `digitalWrite`, `digitalRead`, `touchRead`, `pinMode`, `readAdc`); sensor-expansion globals exposed as zero-filled defaults (`frequencyData`, `energyAverage`, `accelerometer`, `light`, `analogInputs`, `maxFrequency`, `maxFrequencyMagnitude`); sync (`nodeId` → 0). Sound- and sensor-reactive patterns run without error but produce no motion.
- **Deferred** (see the Deferred section): the 2D coordinate-transform stack and a Pixelblaze-accurate array type. In v1 the transform functions (`resetTransform`, `translate`, `scale`, `rotate`, `transform`, and the 3D variants) are inert no-ops, and `array(n)` returns a plain JS array — so patterns that animate via transforms, or that rely on Pixelblaze-specific array methods/semantics, will preview differently than they run on hardware.

### Pattern execution

Render loop (requestAnimationFrame):
1. Compute scaled `delta` using the virtual clock.
2. Call `handle.beforeRender(delta)`.
3. For each LED at grid position `(col, row)`, compute normalised coordinates inclusive of the endpoints: `x = col / (cols - 1)`, `y = row / (rows - 1)`, so the first pixel is at 0 and the last is at exactly 1.0 (matching the hardware mapper's normalized matrix map). Guard the degenerate single-column/single-row case (`cols === 1` → `x = 0`; `rows === 1` → `y = 0`) to avoid divide-by-zero.
4. Call `handle.render2D(index, x, y)`.
5. Capture the pixel color set by `hsv()`/`rgb()` into the pixel array.
6. Paint the pixel array to the Canvas 2D context.

The app starts **paused**. Running state is preserved across pattern switches.

> **Numeric model update.** ADR-0001 (run the preview as float64) is **superseded by ADR-0003**: the preview now defaults to faithful 16.16 fixed-point emulation so the preview matches hardware, with a per-pattern "Fast" renderer (float64) escape hatch. See the feature PRD `Feature - Hardware-Fidelity Preview & ShaderToy Porting.md`. Coordinate generation (step 3 above) is unchanged.

### User pattern storage

User patterns are stored in **IndexedDB** under a dedicated object store. Each record: `{ id: string, name: string, src: string, updatedAt: number }`. Control values are **not** persisted — they are transient session state held in Zustand and reset to defaults on every page load.

A separate key-value store holds **global** app settings (grid config, speed, brightness) — these are not per-pattern.

---

## Features

### UI Layout

- **Top bar** — global status and navigation
- **Left pane** — pattern file list: library files (read-only, grouped separately) and user patterns
- **Middle pane** — Monaco code editor
- **Right pane** — LED preview grid + playback controls + pattern UI controls + var watcher
- **Vertical splitter** — drag to resize middle and right panes

### Offline Mode

The IDE operates entirely without a network connection or hardware controller. Patterns are written, run, and previewed entirely in the browser. A hardware controller is only needed for the (deferred) hardware upload feature.

### Code Library

- Libraries ship with the IDE as read-only source files under `src/pixelblaze/lib/`.
- Each library is one JavaScript file of global-scope flat functions, written in Pixelblaze's language dialect (the same dialect as user patterns). The filename is the namespace: `sdf.js` → `sdf.*`. Library files are `.js`, not `.ts`, because Acorn parses JavaScript directly and the bundled artifact must be valid Pixelblaze code; only the IDE application code (transpiler, runtime, React) is TypeScript.
- Library code is focused on performance, given the strict memory and CPU constraints of the Pixelblaze hardware (256-variable limit, fixed-point arithmetic).
- Libraries do not duplicate any built-in Pixelblaze functionality.
- Libraries may reference functions in other libraries using the same `libname.fn()` dot-notation that user patterns use. These cross-library references are resolved by the transpiler.
- Library files can be opened in the editor for reading but are not editable.
- v1 libraries: `anim` (easing, oscillators, timing), `sdf` (2D signed distance fields and boolean ops), `color` (palette, blend modes), `coord` (polar, coordinate transforms), `noise` (value noise, Perlin helpers).
- Planned library content: scalar math helpers, polar coordinates, SDFs (circle, rect, polygon, segment), blend modes, value noise, palette interpolation, animation primitives.
- Shipped: a `shader` library of GLSL gap-fillers (`fract`, `step`, `dot2/3`, `normalize2/3`, `reflect`, `mat2` rotate, `toUV`, IQ palette, hardware-safe hash) supporting ShaderToy porting — see `Feature - Hardware-Fidelity Preview & ShaderToy Porting.md` (#94).

### Code Editor (Monaco)

- Pixelblaze language mode: JavaScript base with Pixelblaze-specific restrictions enforced.
- **Background parsing** on every keystroke — errors appear without user action.
- **Syntax error squiggles** from the parser surfaced as Monaco markers.
- **Pixelblaze rule violations** flagged as errors: `let`, `const`, `class`, `extends`, `switch`, `case`, `new`, `try`, `catch`, `finally`, `throw`, `import`.
- **Unknown library reference warnings**: `lib.fn()` where `fn` is not defined in `lib`.
- **Autocomplete**: all Pixelblaze built-in functions and constants + all functions from all loaded libraries.
- **Signature hints**: typing `(` after a known function shows parameter names with the active parameter highlighted; advances as commas are typed.
- **Good/Broken compile status indicator** displayed near the editor — updates in real time as the user types.
- **Periodic sync tick** — a timer (every few seconds) checks whether the editor's current source compiles cleanly (parses + passes Pixelblaze rule validation). On a clean compile it both (a) auto-saves the source to IndexedDB and (b) pushes the new code to the preview by reloading the eval engine. Broken code is neither saved nor pushed — the last clean version keeps running. This periodic tick is the **only** mechanism that propagates edits of the active pattern to the preview; there is no per-keystroke re-eval. On push, the eval engine reloads exactly as on a pattern switch: control callbacks are re-invoked with their saved values and pattern state resets, so a running animation will restart from its initial state. (Note: "compiles cleanly" cannot detect an infinite loop, so a syntactically valid runaway loop will still be pushed and can freeze the tab — see ADR-0002.)

### Transpiler

- Acorn-based AST parsing for reliable function extraction and dependency analysis.
- Function-level tree-shaking: only referenced functions (and their transitive dependencies) are inlined — critical for keeping uploaded file sizes within hardware memory limits.
- Resolves cross-library references transitively (library A calling library B).
- Single artifact output: `bundle()` returns `{ code, metadata }`; `code` is the one transpiled file used for both browser preview and hardware download, while `metadata` (export and control names) is a preview-side companion that never reaches the hardware file.
- `export` keywords stripped for browser eval; preserved in the download artifact (the hardware understands `export`).

### Pattern Preview

The right pane shows a configurable grid of LED dots rendered on a Canvas 2D element. Each dot is painted as a filled circle with a glow effect using `shadowBlur` and `shadowColor`. The grid mimics the appearance of a real LED installation.

**Play/pause state machine:**
- The app always starts **paused** when loaded.
- The run-status **pill toggle** sits next to the pattern file name. It shows one of two states: Running / Paused. Clicking it toggles between them.
- When a pattern is loaded, a single preview frame is rendered immediately so the frozen state is visible even while paused.
- **Running state is preserved across pattern switches**: if the app is running when the user switches patterns, the new pattern starts playing immediately; if paused, the new pattern loads and shows a single frozen frame.
- **Runtime exceptions are not surfaced as an error state.** If pattern code throws while rendering, the render loop catches it, quietly stops (the pill returns to Paused), and logs to the console. There is no dedicated error UI — runtime throws are expected to be rare, and compile errors are caught earlier (see below). Compile problems are shown only in the editor (Monaco squiggles + the Good/Broken compile indicator), never via the pill.
- **Pattern dims visually when paused** to reinforce the stopped state.

**User controls in the preview pane:**
- **Brightness**: slider from 0 to 1. Mirrors the brightness setting available on the hardware controller.
- **Grid configuration**: number of rows and columns. Plus two preview-only viewport controls — **preview light size** (how large each light source is drawn, as a fraction of inter-dot pitch) and **diffusion** (blur merging the sources; can be turned to zero). Both are display-only and never reach the map or hardware. See [ADR-0006](../adr/0006-preview-light-size-and-diffusion.md).
- **Playback speed**: multiplier applied to `delta` and `time()` via the virtual clock. Preset values: 0.1×, 0.5×, 1×, 2×.

### Pattern UI Controls

A pattern can export specially-named functions that cause the IDE to render interactive UI controls in the preview area. These allow adjusting pattern variables without editing code.

| Export prefix | UI control | Callback signature |
|---|---|---|
| `sliderX` | Range slider (0–1) | `fn(v: number)` |
| `toggleX` | Toggle switch | `fn(isOn: 0 \| 1)` |
| `hsvPickerX` | HSV colour picker | `fn(h, s, v: number)` |
| `rgbPickerX` | RGB colour picker | `fn(r, g, b: number)` |

v1 supports only these four **input** control types. The remaining Pixelblaze control prefixes — `trigger`, `inputNumber`, `showNumber`, `gauge` — are deferred (see Deferred section); the last two are *output* controls that the IDE would poll for a return value, a separate path. Any exported function whose prefix is not one of the four supported kinds is **ignored** by the controls renderer — no widget, no error, no squiggle. It remains an ordinary exported function (callable internally by the pattern), so patterns authored on hardware that use a `gauge` or `trigger` still load and run, just without that widget.

When a pattern is loaded, each supported control function is called immediately with its current value so pattern state is consistent before the first frame renders. Control values are transient session state — they reset to defaults when the page is reloaded.

### Var Watcher

A table near the pattern preview showing the names and current values of variables the running pattern is using. Updated after every rendered frame. Displays:

- All `export var` declarations from the pattern source (user-exported globals, visible in the Pixelblaze hardware var watcher too).
- Built-in Pixelblaze globals where applicable (e.g. `pixelCount`).

Arrays are shown with each element and its index. The data is sampled at the end of each render cycle — for variables modified inside `render2D`, only the last value from the final pixel is shown (consistent with how the hardware var watcher behaves).

### Pattern Management

- Pattern list in the left pane shows library files (read-only, grouped at top) and user patterns (below).
- **Create** new user pattern from a runnable starter skeleton. The IndexedDB record is written immediately on create (generated `id`, default name `"Untitled Pattern"`, skeleton `src`) and loaded into the editor, so the sync-tick has a target and the pattern persists before any edit. The skeleton renders an immediate hue gradient so the pipeline is visibly working:

  ```js
  export function beforeRender(delta) {
  }

  export function render2D(index, x, y) {
    hsv(x, 1, 1)
  }
  ```
- **Rename** user pattern inline. Names need not be unique — the `id` is the identity (mirroring the hardware, where pattern IDs identify a pattern and names may collide).
- **Delete** user pattern.
- Switching patterns loads the selected source into the editor and reloads the eval engine.

### Export / Download

- **Download current pattern**: transpiles the pattern currently open in the editor into a self-contained flat `.js` file — all referenced library functions inlined, `export` keywords preserved — saved as `<sanitized-name>.js`. This is the literal code that runs on the hardware: the user uploads it to a Pixelblaze controller via the ElectroMage web UI, or copy-pastes its contents into the ElectroMage editor. There is no bulk/all-patterns export.
- **Copy transpiled code to clipboard**: the same transpiled artifact as the download, written to the clipboard (`navigator.clipboard.writeText`) for direct paste into the ElectroMage editor — skipping the download/open/copy round-trip.

---

## Testing Philosophy

- **Pure functions by default.** All logic that can be separated from React and the DOM is written as pure TypeScript functions and tested in isolation. This applies to the transpiler, runtime shim, storage layer, and any complex UI logic.
- **TDD loop during feature development.** Tests are written before the implementation. Features are not complete until new tests pass.
- **Three-tier commit gate** enforced by a pre-commit hook (Husky + Vitest):
  1. All existing unit tests pass.
  2. All newly written unit tests for the feature pass.
  3. A designated smoke test suite passes.
- **Integration tests** accumulate over time: multi-layer tests (transpile → eval → render pixel output) are added as features ship.
- **React components** are tested lightly (smoke tests only). Heavy coverage lives in the engine layer.
- Canvas rendering is not unit tested; covered indirectly by eval integration tests.

---

## Prioritized Feature List

### Phase 1 — Project scaffold
1. Vite + React + TypeScript, Tailwind, shadcn/ui, Vitest, Husky pre-commit hook
2. Four-pane app layout shell (top bar, left, middle, right) — structure only
3. Zustand store skeleton — all state slices typed, no logic

### Phase 2 — Transpiler (fully unit-tested)
4. Library file loader — import lib source files, expose by namespace name
5. Acorn-based function extractor — `extractFn(libSrc, fnName)` with unit tests
6. Transitive dependency collector — `collectDeps(fnSrc, libSrc)` recursive walk, unit tested
7. Name mangler — `munge(libName, fnName)` → `_lib_fn`, unit tested
8. Full bundler — `bundle(patternSrc)` → `{ code, metadata }`, integration tested
9. Seed libraries — port `anim.js` and `sdf.js`; bundler tests against them

### Phase 3 — Runtime shim and pattern eval
10. Pixelblaze runtime shim — all built-ins injectable, virtual clock for `time()` and `delta`
11. Pattern loader — `loadPattern(src)` → handle, unit tested
12. Syntax checker — Pixelblaze rule validator, unit tested

### Phase 4 — First pixels on screen
13. Canvas LED grid — glowing dots, configurable rows/cols + preview light size/diffusion
14. rAF render loop — calls `beforeRender` + `render2D`, collects pixel colours
15. Wire-up smoke test — seed pattern renders correctly in the preview pane

### Phase 5 — Monaco editor
16. Monaco integration — JS mode + Pixelblaze language config
17. Error squiggles — syntax checker results as Monaco markers
18. Good/Broken compile status indicator — real-time badge in the header
19. Library ref validation — unknown `lib.fn` references flagged as warnings
20. Autocomplete — Pixelblaze built-ins + library functions; backed by `builtins.ts` manifest; snippet insertion with tab-through params
21. Signature hints — parameter names on `(`; active param advances on `,`; backed by `resolveSignatureContext()` in `builtins.ts`

### Phase 6 — Pattern storage and file list
21. IndexedDB CRUD — tested with `fake-indexeddb`
22. Pattern list UI — library files (read-only) + user patterns in left pane
23. Pattern switching — selecting a pattern loads it into editor and eval
24. New pattern — create blank user pattern
25. Rename and delete pattern

### Phase 7 — Playback and grid controls
26. Run/pause pill toggle — state preserved across pattern switches, starts paused
27. Playback speed control — virtual clock scaling (0.1×–2×)
28. Brightness control (0–1)
29. Grid config controls — rows, cols, preview light size, diffusion amount (zero = off)
30. Periodic sync tick — on clean compile, auto-save to IndexedDB and push new code to the preview

### Phase 8 — Pattern controls and var watcher
31. Pattern controls UI — sliders, toggles, hsvPicker, rgbPicker
32. Var watcher — exported variable names + live values, refreshed each frame

### Phase 9 — Remaining libraries
33. Port `color.js`
34. Port `coord.js`
35. Port `noise.js`
36. Library files visible in pattern list as read-only, openable in editor

### Phase 10 — Export
37. Download current pattern — bundled `.js` for hardware; Copy transpiled code to clipboard

### Phase 11 — Polish
39. Vertical splitter — drag to resize editor/preview panes
40. Pattern preview dims when paused

---

## Deferred (not in v1)

### Hardware upload

> **Now specified separately.** This bullet is superseded by the feature PRD `Feature - Hardware Connectivity.md`, which connects to a controller over its WebSocket API and is sequenced validate → discover → decide-UI. Its Phase 1 (a Node comms layer + manual divergence harness) is committed because it unblocks the hardware-fidelity feature's divergence harness; the rest (automated pattern push, the local bridge, and the IDE integration UI) is captured there as vision, not yet greenlit.

Find and connect to a Pixelblaze controller on the local network. Use the controller's WebSocket API to:
- Read the list of existing patterns stored on the device.
- Upload a transpiled pattern to the controller.
- Interact with the controller's other APIs, including setting pattern variables remotely.

### Runtime built-ins deferred from v1

- **2D coordinate-transform stack** — `translate`, `scale`, `rotate`, `transform`, `resetTransform` applied to pixel-map coordinates before each `render2D` call, via a per-frame matrix stack (the hardware supports up to 31 transforms). In v1 these functions are inert no-ops, so patterns that animate by transforming coordinates will appear static in the preview. The 3D transform variants (`rotateX/Y/Z`, `translate3D`, `scale3D`) are deferred with the rest of 3D support.
- **Pixelblaze-accurate array type** — the array function/method duality (`arraySort`/`a.sort()`, `mapTo`, `mutate`, `replace`, `sum`, `sortBy`, …) with Pixelblaze's numeric semantics (e.g. numeric rather than lexicographic sort). In v1 `array(n)` returns a native JS array: native methods (`forEach`, `reduce`, `length`) behave as in JS, but the Pixelblaze-only method forms are unavailable and array-heavy patterns may diverge.

### Pattern control types deferred from v1

- **`trigger`** — fire-once button (no value, not called on load).
- **`inputNumber`** — free numeric entry, not constrained to 0–1.
- **`showNumber`** — output display; the IDE polls the function and shows its returned number.
- **`gauge`** — output display; returned 0–1 shown as a bar.

`showNumber` and `gauge` are output controls requiring a poll-and-display path distinct from the four input controls. Until these ship, patterns using these prefixes load and run with the widgets simply absent.

### Other deferred features

- **1D `render(index)` support** — strip patterns that don't use a 2D pixel map. The preview would render them as a single row.
- **`render3D(index, x, y, z)` support** — 3D pixel map patterns.
- **Load pattern from disk** — import a `.js` pattern file previously downloaded from the ElectroMage Pixelblaze editor.
- **Library function demos** — one runnable demo pattern per library function illustrating its behaviour.
- **Progressive demo patterns** — a curated set of patterns that build in complexity step by step, teaching animation techniques.
- **Shader import (automated rewrite)** — investigate *automatically* rewriting GLSL shaders into Pixelblaze's language. Note: human-assisted ShaderToy porting (a `shader` library + a porting guide, on top of a hardware-fidelity preview) is specified separately in `Feature - Hardware-Fidelity Preview & ShaderToy Porting.md`; only the fully-automated rewrite remains deferred here.
