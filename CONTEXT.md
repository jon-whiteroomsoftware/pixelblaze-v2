# Pixelblaze IDE v2

A browser-based IDE for authoring, previewing, and exporting Pixelblaze LED patterns offline, with reusable code libraries the stock ElectroMage editor lacks.

## Language

**Pixelblaze**:
A hardware LED controller sold by ElectroMage, and the broader ecosystem (hardware, firmware, tooling) around it.

**Pattern**:
A source file in Pixelblaze's JavaScript-derived language that runs on a controller; also the LED display that results from running it. Authored by the user.
_Avoid_: program (the websocket API's term), sketch, script.

**Library**:
A bundled, read-only file of reusable global-scope functions shipped with the IDE, referenced from patterns as `libname.fn()`. The filename is the namespace (`sdf.js` → `sdf`).
_Avoid_: module, package, import.

**Built-in**:
A function or constant provided by the Pixelblaze runtime itself (`hsv`, `time`, `wave`, `sin`, `PI`, …) rather than by a library. Patterns call built-ins bare, without a namespace.
_Avoid_: native function, intrinsic.

**Control**:
An interactive preview-pane widget (slider, toggle, HSV/RGB picker) generated when a pattern exports a specially-named function (`sliderX`, `toggleX`, `hsvPickerX`, `rgbPickerX`). Its value is persisted per-pattern.
_Avoid_: input, knob, parameter, setting.

**Transpiled artifact** (or **artifact**):
The single flat JavaScript file the transpiler produces for a pattern — referenced library functions inlined, namespace calls rewritten. Valid for both browser preview and hardware upload. The downloadable/copyable output.
_Avoid_: bundle (the verb is fine; the noun is the artifact), build, output file.

**Transpiler**:
The engine component that turns pattern source into a transpiled artifact: it parses with Acorn, resolves library references (including transitive cross-library ones), tree-shakes to only referenced functions, and mangles names. Returns `{ code, metadata }`.

**Var watcher**:
The preview-pane table showing the live values of a pattern's `export var` globals, sampled after each rendered frame.

**Preview grid**:
The configurable matrix of glowing LED dots (Canvas 2D) that stands in for a physical LED installation. A single global grid, not per-pattern.

**Fixed-point fidelity**:
Running the preview with the same 16.16 fixed-point numeric behaviour as the hardware (range ±32768, precision ~1/65536, int32-wrap overflow, faithful multiply) so that what the preview shows matches what a physical Pixelblaze does. The default preview mode.
_Avoid_: emulation accuracy, hardware mode.

**Fast preview**:
The opt-out escape hatch that renders in plain float64 instead of fixed-point fidelity, for smooth editing of heavy patterns that are too slow under fidelity. A speed-over-truth toggle.
_Avoid_: float mode, preview accuracy off.

**Divergence**:
A difference between preview output and real-hardware output. Two independent kinds: _numeric divergence_ (float64 vs 16.16 — closed by fixed-point fidelity) and _algorithmic divergence_ (the shim's `perlin`/`prng`/transcendentals implementing different algorithms than firmware — documented, not chased).

**Divergence harness**:
A test rig that probes a real Pixelblaze (via `getVars` on a sentinel pixel index) to characterise a built-in's true output and compare it against the preview, quantifying divergence per built-in.

## Example dialogue

**Dev:** When the user hits Download, do we ship the metadata too?

**Domain expert:** No — Download and Copy both emit only the transpiled artifact's `code`. The metadata (which vars are exported, which controls exist) is only used to wire up the var watcher and the controls in the preview. The hardware never sees it.

**Dev:** And if a pattern calls `sdf.circle()` which itself calls `sdf.smoothMin()`?

**Domain expert:** The transpiler inlines both — it follows transitive references within and across libraries. Only the functions actually reached get inlined; the rest of the library is tree-shaken out so the artifact stays small enough for the hardware.

**Dev:** What about `hsv()` — is that a library function?

**Domain expert:** No, `hsv` is a built-in. It's not namespaced and it's not inlined — the runtime provides it. A library is the stuff under `src/pixelblaze/lib/`, always referenced with a namespace.
