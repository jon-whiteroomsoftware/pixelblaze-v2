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
_Note_: distinct from **Controller** (the physical box). One letter apart, so never abbreviate — code and UI always spell out `control` vs `controller` (a "Controls" panel is the widgets; a "Controllers" list is the devices).

**Controller**:
A physical Pixelblaze reachable over the network via its WebSocket API (port 81, JSON + binary frames). The thing the IDE connects to, lists patterns from, pushes patterns to, and reads/writes variables and controls on. There may be more than one on a network, though typically one.
_Avoid_: device, board, unit, node — though the ElectroMage WebSocket API itself says "board," the IDE's canonical term is Controller. Never shorten to "control."

**Local bridge** (or **bridge**):
A small Node process the user runs on their own LAN that lets the deployed (GitHub Pages, https) IDE reach a Controller. The browser cannot open the Controller's `ws://` socket directly (mixed-content blocking), but it can reach the bridge at `ws://127.0.0.1` (localhost is mixed-content-exempt); the bridge, running outside the browser sandbox, talks to the Controller and handles discovery. Optional, local-only, and purely additive — authoring/preview/export work with no bridge installed. The IDE never launches the bridge; the user runs it and the IDE detects it.
_Avoid_: server, backend, daemon, proxy — it is a bridge.

**Transpiled artifact** (or **artifact**):
The single flat JavaScript file the transpiler produces for a pattern — referenced library functions inlined, namespace calls rewritten. Valid for both browser preview and hardware upload. The downloadable/copyable output.
_Avoid_: bundle (the verb is fine; the noun is the artifact), build, output file.

**Transpiler**:
The engine component that turns pattern source into a transpiled artifact: it parses with Acorn, resolves library references (including transitive cross-library ones), tree-shakes to only referenced functions, and mangles names. Returns `{ code, metadata }`.

**Var watcher**:
The preview-pane table showing the live values of a pattern's `export var` globals, sampled after each rendered frame.

**Pixel map** (or **map**):
An ordered, explicitly-positioned set of points standing in for a physical LED installation — list position is the LED **index**, and each point carries where it sits in space. Workspace-owned and selectable per pattern (a controller is an optional downstream consumer, not a prerequisite). A uniform grid is the simplest map, not a separate concept.
_Avoid_: layout, geometry, coordinate set, pixel mapping.

**Preview grid**:
The degenerate **map**: a uniform 2D plane of glowing LED dots. Historically the only layout (a single global grid); now the default stock 2D map, with its rows/cols reframed as that map's generator parameters. Its internal pixel *pitch* (the fit-to-container `spacing`, derived from container width ÷ cols) is a pure layout detail, distinct from the user-facing **preview light size** knob — the pitch positions the dots, light size only scales how large they're drawn.

**Dimensionality** (of a pattern or map):
Which of **1D / 2D / 3D** a pattern runs as, or a map supplies — always the **display/layout** dimension, never a coordinate-argument count. Named by the render fn via a bijection: `render` → 1D, `render2D` → 2D, `render3D` → 3D. A `render()` pattern is **1D** even though it takes zero coordinates, because a strip of LEDs is inherently a 1D layout. A pattern's dimensionality is the highest render fn it defines.
_Avoid_: sampling dimensionality (collapses display dimension with arg count — they differ), dimension count.

**Sample / position** (of a map point):
Two independent per-point channels. **sample** — the coordinates fed to the render fn (`[]` for 1D, `[x,y]` for 2D, `[x,y,z]` for 3D); always owned by the **map**. **pos** — where the dot is *drawn* (a 2D or 3D point). `pos` is **dual-sourced**: *map-intrinsic* when the map encodes real geometry (grid, cube, a measured installation), but *viewport-supplied* when the pattern leaves position free (a 1D `render()` pattern, whose `sample` is empty — see **Shape**). They coincide for a grid; they diverge for a ring (sample `[]`, pos a 2D circle, viewport-supplied) or a 2D-on-3D drape (sample `[x,y]`, pos 3D, map-intrinsic).
_Avoid_: using "coordinates" unqualified — say sample or pos.

**Shape** (viewport embedding):
The cosmetic path a 1D pattern's pixels are *drawn* along — line, ring, polygon, helix/spiral. Because a 1D `render()` pattern's `sample` is empty, the shape changes only `pos`, never what the pattern computes, so it belongs to the **viewport**, not the map. A shape becomes *semantic* (real pattern input) only when the pattern consumes coordinates — at which point it is a 2D/3D **map**, not a shape. In the UI a single "Shape" dropdown spans both; in code the cosmetic 1D shapes are viewport embeddings and the semantic 2D/3D shapes are maps. A shape's display dimension may exceed the pattern's (a 1D pattern on a helix displays in 3D).
_Avoid_: calling a 1D shape a "map"; calling a 2D/3D map a "shape."

**Viewport** (or **camera**):
The display side of the preview — orbit/turntable, fit-to-container, depth cueing, **preview light size**, the **diffusion** blur, and (for 1D) the shape embedding. Owns everything about *how* pixels are drawn; owns nothing the pattern can observe (light size, diffusion, and shape stay invisible to a pattern because `sample` is normalized independently). The viewport's control set is gated on the *display* dimension (a 3D embedding shows orbit controls even for a 1D pattern), not the pattern's dimensionality.
_Avoid_: conflating viewport light size with map geometry — neither light size nor diffusion ever reaches `sample` or the hardware.

**Preview light size** (or **light size**):
A purely cosmetic viewport control setting how large each drawn light source (the glowing dot in 1D/2D, the orb in 3D) appears, as a fraction of the inter-dot pitch — so "almost touching" lands at the same felt point in every dimension regardless of pixel count or camera zoom. It grows the light sources *in place*: positions and the layout's extent never move (the line keeps its length, the plane/cube keep their bounds). A preview-only construct — never serialized into a **map** and never sent to a **controller** (that physical density is the map's job, not this). A global viewing-comfort pref, persisted, not per-pattern.
_Avoid_: "spacing" (the old name — it implied moving the dots apart, which it never did); "LED size" / "dot size" (read as hardware or undersell the 3D orb); conflating with **diffusion**.

**Diffusion**:
A purely cosmetic viewport control blurring the drawn light sources together, like a physical diffuser over real LEDs. At 0 the sources are crisp and individually distinct; at full diffusion they merge into an opaque field with no individual source visible. Strictly independent of **preview light size** (it never changes a source's size) and of **brightness** (the field never looks darker overall as diffusion rises — energy is conserved; peaks may soften but nothing dims). Mechanism may differ per display dimension so long as the *feel* is uniform across 1D/2D/3D. Preview-only — never serialized into a **map** or sent to a **controller**. A global viewing-comfort pref, persisted, not per-pattern.
_Avoid_: "glow" (the old PRD term); letting diffusion change brightness or source size.

**Precise renderer**:
The default renderer, running the preview with the same 16.16 fixed-point numeric behaviour as the hardware (range ±32768, precision ~1/65536, int32-wrap overflow, faithful multiply) so that what the preview shows matches what a physical Pixelblaze does. The underlying numeric behaviour is _fixed-point fidelity_.
_Avoid_: Fidelity mode, emulation accuracy, hardware mode.

**Fast renderer**:
The opt-out escape hatch that renders in plain float64 instead of fixed-point fidelity, for smooth editing of heavy patterns that are too slow under the Precise renderer. A speed-over-truth toggle.
_Avoid_: fast preview, float mode, preview accuracy off.

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
