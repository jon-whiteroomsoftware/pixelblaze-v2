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

### Transpiler design

Library files are written as **global-scope flat functions** — no object wrappers, no ES module exports. The filename determines the namespace: `sdf.js` → `sdf` namespace.

User patterns reference library functions using dot notation: `sdf.circle(px, py, cx, cy, r)`. The transpiler:

1. Uses Acorn to parse the pattern source into an AST.
2. Detects all `namespace.fn()` call expressions where `namespace` matches a known library filename.
3. For each referenced function, uses Acorn to extract the function body from the library source.
4. Recursively collects transitive dependencies within the same library.
5. Mangles names to avoid collisions: `sdf.circle` → `_sdf_circle`.
6. Produces a **single flat artifact**: all inlined functions prepended, all `namespace.fn()` calls rewritten to `_namespace_fn()`, `export` keywords preserved.

The same artifact is used for browser preview and hardware upload. For browser eval, `export` is stripped by the runtime wrapper. For hardware upload, the artifact is sent verbatim.

### Runtime shim

The browser runtime injects all Pixelblaze built-in functions (`hsv`, `rgb`, `time`, `wave`, `sin`, `abs`, etc.) as parameters to a `new Function()` call. This avoids polluting the global scope and makes the shim fully injectable for testing.

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

### Pattern execution

Render loop (requestAnimationFrame):
1. Compute scaled `delta` using the virtual clock.
2. Call `handle.beforeRender(delta)`.
3. For each LED at grid position `(col, row)`, compute normalised `x = col / cols`, `y = row / rows`.
4. Call `handle.render2D(index, x, y)`.
5. Capture the pixel color set by `hsv()`/`rgb()` into the pixel array.
6. Paint the pixel array to the Canvas 2D context.

The app starts **paused**. Running state is preserved across pattern switches.

### User pattern storage

User patterns are stored in **IndexedDB** under a dedicated object store. Each record: `{ id: string, name: string, src: string, updatedAt: number }`. A separate key-value store holds app settings (grid config, speed, brightness).

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
- Each library is one TypeScript file of global-scope flat functions. The filename is the namespace: `sdf.ts` → `sdf.*`.
- Library code is focused on performance, given the strict memory and CPU constraints of the Pixelblaze hardware (256-variable limit, fixed-point arithmetic).
- Libraries do not duplicate any built-in Pixelblaze functionality.
- Libraries may reference functions in other libraries using the same `libname.fn()` dot-notation that user patterns use. These cross-library references are resolved by the transpiler.
- Library files can be opened in the editor for reading but are not editable.
- v1 libraries: `anim` (easing, oscillators, timing), `sdf` (2D signed distance fields and boolean ops), `color` (palette, blend modes), `coord` (polar, coordinate transforms), `noise` (value noise, Perlin helpers).
- Planned library content: scalar math helpers, polar coordinates, SDFs (circle, rect, polygon, segment), blend modes, value noise, palette interpolation, animation primitives.

### Code Editor (Monaco)

- Pixelblaze language mode: JavaScript base with Pixelblaze-specific restrictions enforced.
- **Background parsing** on every keystroke — errors appear without user action.
- **Syntax error squiggles** from the parser surfaced as Monaco markers.
- **Pixelblaze rule violations** flagged as errors: `let`, `const`, `class`, `extends`, `switch`, `case`, `new`, `try`, `catch`, `finally`, `throw`, `import`.
- **Unknown library reference warnings**: `lib.fn()` where `fn` is not defined in `lib`.
- **Autocomplete**: all Pixelblaze built-in functions and constants + all functions from all loaded libraries.
- **Signature hints**: typing `(` after a known function shows parameter names with the active parameter highlighted; advances as commas are typed.
- **Good/Broken compile status indicator** displayed near the editor — updates in real time as the user types.
- **Periodic auto-save** triggered while code compiles cleanly. Broken code is not auto-saved.

### Transpiler

- Acorn-based AST parsing for reliable function extraction and dependency analysis.
- Function-level tree-shaking: only referenced functions (and their transitive dependencies) are inlined — critical for keeping uploaded file sizes within hardware memory limits.
- Resolves cross-library references transitively (library A calling library B).
- Single artifact output: the same transpiled file is used for browser preview and hardware download.
- `export` keywords stripped for browser eval; preserved in the download artifact (the hardware understands `export`).

### Pattern Preview

The right pane shows a configurable grid of LED dots rendered on a Canvas 2D element. Each dot is painted as a filled circle with a glow effect using `shadowBlur` and `shadowColor`. The grid mimics the appearance of a real LED installation.

**Play/pause state machine:**
- The app always starts **paused** when loaded.
- The run-status **pill toggle** sits next to the pattern file name. It shows one of three states: Running / Paused / Error. Clicking it toggles between Running and Paused.
- When a pattern is loaded, a single preview frame is rendered immediately so the frozen state is visible even while paused.
- **Running state is preserved across pattern switches**: if the app is running when the user switches patterns, the new pattern starts playing immediately; if paused, the new pattern loads and shows a single frozen frame.
- **Error state always pauses.** The pill shows Error and the pattern stops running until the code is fixed and reloaded.
- **Pattern dims visually when paused** to reinforce the stopped state.

**User controls in the preview pane:**
- **Brightness**: slider from 0 to 1. Mirrors the brightness setting available on the hardware controller.
- **Grid configuration**: number of rows, number of columns, LED spacing, glow amount. Glow can be disabled entirely.
- **Playback speed**: multiplier applied to `delta` and `time()` via the virtual clock. Preset values: 0.1×, 0.5×, 1×, 2×.

### Pattern UI Controls

A pattern can export specially-named functions that cause the IDE to render interactive UI controls in the preview area. These allow adjusting pattern variables without editing code.

| Export prefix | UI control | Callback signature |
|---|---|---|
| `sliderX` | Range slider (0–1) | `fn(v: number)` |
| `toggleX` | Toggle switch | `fn(isOn: 0 \| 1)` |
| `hsvPickerX` | HSV colour picker | `fn(h, s, v: number)` |
| `rgbPickerX` | RGB colour picker | `fn(r, g, b: number)` |

When a pattern is loaded, each control function is called immediately with its saved value so pattern state is consistent before the first frame renders. Control values are persisted across pattern reloads and app restarts.

### Var Watcher

A table near the pattern preview showing the names and current values of variables the running pattern is using. Updated after every rendered frame. Displays:

- All `export var` declarations from the pattern source (user-exported globals, visible in the Pixelblaze hardware var watcher too).
- Built-in Pixelblaze globals where applicable (e.g. `pixelCount`).

Arrays are shown with each element and its index. The data is sampled at the end of each render cycle — for variables modified inside `render2D`, only the last value from the final pixel is shown (consistent with how the hardware var watcher behaves).

### Pattern Management

- Pattern list in the left pane shows library files (read-only, grouped at top) and user patterns (below).
- **Create** new user pattern from a blank template.
- **Rename** user pattern inline.
- **Delete** user pattern.
- Switching patterns loads the selected source into the editor and reloads the eval engine.

### Export / Download

- **Download single pattern**: transpiles the current pattern into a self-contained flat `.js` file with all library dependencies inlined, ready to upload to a Pixelblaze controller via the ElectroMage web UI.
- **Download all patterns**: packages every user pattern as individual transpiled `.js` files into a single `.tar.gz` archive.

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
8. Full bundler — `bundle(patternSrc)` → flat artifact, integration tested
9. Seed libraries — port `anim.js` and `sdf.js`; bundler tests against them

### Phase 3 — Runtime shim and pattern eval
10. Pixelblaze runtime shim — all built-ins injectable, virtual clock for `time()` and `delta`
11. Pattern loader — `loadPattern(src)` → handle, unit tested
12. Syntax checker — Pixelblaze rule validator, unit tested

### Phase 4 — First pixels on screen
13. Canvas LED grid — glowing dots, configurable rows/cols/spacing/glow
14. rAF render loop — calls `beforeRender` + `render2D`, collects pixel colours
15. Wire-up smoke test — seed pattern renders correctly in the preview pane

### Phase 5 — Monaco editor
16. Monaco integration — JS mode + Pixelblaze language config
17. Error squiggles — syntax checker results as Monaco markers
18. Library ref validation — unknown `lib.fn` references flagged as warnings
19. Autocomplete — Pixelblaze built-ins + library functions
20. Signature hints — parameter names on `(` after a library function call

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
29. Grid config controls — rows, cols, spacing, glow amount, glow on/off
30. Periodic auto-save — saves while code compiles cleanly

### Phase 8 — Pattern controls and var watcher
31. Pattern controls UI — sliders, toggles, hsvPicker, rgbPicker
32. Var watcher — exported variable names + live values, refreshed each frame

### Phase 9 — Remaining libraries
33. Port `color.js`
34. Port `coord.js`
35. Port `noise.js`
36. Library files visible in pattern list as read-only, openable in editor

### Phase 10 — Export
37. Download single pattern — bundled `.js` for hardware
38. Download all patterns — tar.gz archive

### Phase 11 — Polish
39. Vertical splitter — drag to resize editor/preview panes
40. Good/Broken compile status indicator
41. Pattern preview dims when paused
42. Error state auto-pauses

---

## Deferred (not in v1)

### Hardware upload

Find and connect to a Pixelblaze controller on the local network. Use the controller's WebSocket API to:
- Read the list of existing patterns stored on the device.
- Upload a transpiled pattern to the controller.
- Interact with the controller's other APIs, including setting pattern variables remotely.

### Other deferred features

- **1D `render(index)` support** — strip patterns that don't use a 2D pixel map. The preview would render them as a single row.
- **`render3D(index, x, y, z)` support** — 3D pixel map patterns.
- **Load pattern from disk** — import a `.js` pattern file previously downloaded from the ElectroMage Pixelblaze editor.
- **Library function demos** — one runnable demo pattern per library function illustrating its behaviour.
- **Progressive demo patterns** — a curated set of patterns that build in complexity step by step, teaching animation techniques.
- **Shader import** — investigate importing GLSL shaders via an automated rewrite to Pixelblaze's language.
