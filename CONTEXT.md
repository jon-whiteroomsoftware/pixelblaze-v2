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
_Avoid_: geometry, coordinate set, pixel mapping. (Not "layout" as a bare synonym — but **Layout** is a defined union term for the dropdown that selects a map *or* a 1D shape; see **Layout**.)

**Layout** (the preview's two-control selection):
Collective term for *the spatial arrangement chosen for the preview*, now split across **two orthogonal controls** rather than one union dropdown:
- the **Map** control — owns `sample`; present whenever the pattern's sample is non-empty (2D and 3D patterns). Absent for 1D.
- the **embedding** control — owns `pos`; populated with **shapes** for a 1D pattern, **surfaces** for a 2D pattern, and trivial (identity) for a 3D map. Present whenever there is a display choice to make.
So a **1D** pattern shows one control (shape), a **2D** pattern shows two (map + surface, map on the left), a **3D** pattern shows one (map). Controls appear/disappear with the pattern's dimensionality — acceptable because dimensionality only changes when the user deliberately switches patterns in the left rail. The earlier single "Layout dropdown" union is **retired** (it conflated `sample` selection with `pos` selection; the §**Sample / position** split now has one control each). "Layout" survives only as this collective noun; elsewhere it stays a forbidden synonym for **map**.
_Avoid_: "the Layout dropdown" (there are two controls now — say the **Map** control or the **embedding** control); using "layout" to mean a **map** specifically (say map).

**Resolved layout**:
The *drawn realization* of a **Layout** selection — what `resolveLayout` (`src/engine/layout.ts`) produces from the selection plus the pattern's **dimensionality**, the modeled pixel count, and the **normalize** mode. Distinct from the *selection* (the persisted `mapId`/`shapeId`/`surfaceId`): the resolved layout is the corrected selection **plus** the per-index `sample`+`pos` (**map points**), the modeled `pixelCount`, the **display** dimension, the grid readout label, and the draw channel — a 2D position list, or a 3D position list with optional solid-eligible **surface normals** (`normals !== null` *is* the **solidity** eligibility). It is the single seam the preview's render effect consumes: the component writes the corrected selection back to the store and feeds the rest to the renderer/render loop, holding no layout logic itself. The resolver is engine-pure (no store/React import) — its store-coupled lookups (`resolveMap`, `mapGridDims`, the per-dimension default count) are **injected** as `deps`, which is also what makes every branch (line/ring/pole shape, plane, 2D cloud, cube, shell, cylinder-wrap) table-testable with fake maps.
_Avoid_: conflating it with the **Layout** *selection* (one is the chosen ids, the other the drawn points/normals); "resolved map" (a **map** resolves to **map points**; the resolved *layout* also folds in the embedding, count, normals, and label).

**Stock map**:
A **map** that ships with the IDE — selectable in the preview but never listed in "Your Maps" and never deletable. The defining axis is *provenance* (ships with the IDE). A stock map is **never openable** in the editor. Every **2D/3D stock map is backed by real plain-JS map source** (a `function(pixelCount)` returning a coordinate array, ADR-0008) which is **the single source of truth** the preview runs (via `new Function`, float64, no fixed-point shim) and **regenerates live** for any count — stock maps never go stale, so the baked-replay mechanism (ADR-0007) is reserved for **custom maps** only. The source is **hardware-Mapper-faithful and self-contained**: it reads like a function you could paste into a real Pixelblaze Mapper tab (`Math.*` and language built-ins only, no IDE helpers or **libraries**), returns **raw geometry**, and the engine applies the shared aspect-preserving **normalization** pass (ADR-0009). Such a stock map can be *copied* as a starting **template** for a new **custom map**. Every stock map is source-backed — there is no exception (the former no-source "drape cylinder" is no longer a map at all but a 2D viewport **Surface** composed onto the Square; ADR-0010). **1D** layouts are viewport **shapes**, not maps, and are out of this scheme entirely. (A true-3D tube/pole map — source-backed, `sample == pos` — is a possible later catalogue addition.)
_Avoid_: built-in map (collides with **Built-in**, reserved for runtime functions/constants); default map (ambiguous with the auto-picked-on-open map).

**Custom map**:
A **map** the *user authored* (by writing a map function or importing a coordinate list) — the only kind listed in "Your Maps," the only kind **openable in the editor**, and editable/deletable. Provenance, not mechanism, is what makes it custom. Its record is **source + baked output**: the editable plain-JS map function (`function(pixelCount){ … return coords }`, ADR-0008) plus the coordinate array that function baked to (ADR-0007), together with its integer **grid dims** when the baked points form a regular lattice (ADR-0009, for the layout readout). There is no explicit save: like a pattern, the source **auto-bakes on the editor's periodic sync tick** whenever it parses (eval via plain `new Function`, float64, no shim — ADR-0008), and a separate **"Deploy to preview"** action pushes the baked map onto the running pattern (enabled only when its dimensionality matches the previewed pattern). It is born from the **New Map** flow: the editor opens on a default working **skeleton**, and the user either edits it directly or loads a stock-map **template** (see **Template**) into it; an imported coordinate list is wrapped as a literal-returning source so even it is editable. Never (for the openable kind) without source.
_Avoid_: user map (fine in UI prose as "Your Maps," but the canonical term is custom map).

**Template** (stock-map):
The verbatim plain-JS **source** of a source-backed **stock map** (Square, Wide 2:1, the Cube/Sphere/Star shell and volume maps, Ring), loaded into the **New Map** editor as a starting point for a new **custom map**. The **only** way to see stock-map code — stock maps are never openable in place; loading a template forks an editable custom copy. A template load copies **source text only** — never name (user-set) or `dim` (inferred at bake from the returned arity). Browsable from a **"Load template" dropdown** in the New Map editor: loading is silent when the buffer is pristine (byte-identical to the last-loaded baseline — skeleton or a previously-loaded template) and **confirms before overwriting** once edited.
_Avoid_: seed (reserved for the example clouds' historical IDB rows); preset.

**Recommended settings** (curated-pattern → settings, ADR-0013):
A purely **IDE-side**, preview-only table of the settings a curated pattern (a **demo**) is meant to open with, so it shows off at its best without forcing anything (e.g. the sphere-rings demo recommends the Sphere shell map, 4096 pixels, solidity `0.3`). It is *not* part of the Pixelblaze universe — the physical **Controller** knows only patterns and maps, never associations — and it lives **nowhere in the pattern source or the transpiled artifact**: it is one registry keyed by curated-pattern id, **layer 2** of the **settings cascade**, consumed by the settings resolver as the default whenever a pattern has no per-pattern override for a field. Any subset of the cascaded fields may be recommended (map, pixel count, solidity, normalize, shape/surface, brightness, speed, and the hybrid comfort prefs light size / diffusion); a field with no recommendation falls through to the user **global-sticky** or **developer default** below it. Every recommended value stays freely overridable; the recommendation only sets the baseline a user's own adjustment outranks. Applies to **demos** (read-only, no `PatternRecord`); a **custom pattern** has no recommendation layer — just defaults + its own overrides. The three earlier sibling registries (recommended map, recommended pixel count, recommended solidity) are **collapsed into this one** (ADR-0013).
_Avoid_: baking the association into pattern source or a `//@map` comment (would pollute the artifact); "required map" / "bound map" (it is only a default, never a constraint); treating the old three separate registries as distinct concepts (one table now).

**Settings cascade** (ADR-0013):
How every tunable preview setting resolves to an effective value: four layers, first hit wins, top-down — **per-pattern override** → **recommended** (curated patterns only) → user **global-sticky** (comfort prefs only) → **developer default**. Per-pattern overrides are **sparse** (`Partial`) and written *only* on genuine user manipulation of a control (never inferred from a stored value equalling a default — those are indistinguishable). Field partition: **per-pattern cascaded** (`mapId`, `shapeId`/`surfaceId`, `pixelCount`, `solidity`, `normalize`, `brightness`, `speed`); **hybrid comfort prefs** (`lightSize`, `diffusion` — global-sticky baseline *and* per-pattern overridable); **pure global** (`fidelity` — one sticky value, never cascaded). **Forking** a demo snapshots its *effective* settings into the new record as explicit overrides (a frozen copy, no live pointer back). **Reset to defaults** clears a pattern's overrides.
_Avoid_: calling any preview setting "global, not per-pattern" as a blanket rule (overturned by ADR-0013 — only `fidelity` is purely global now).

**Map mode** (of the editor):
The editor pane's third flavor, beside read-only (demos/libraries) and editable-pattern (with a compile-good/broken badge). Opened by clicking **New Map** (a fresh **custom map** on the default skeleton, with a "Load template" dropdown) or by clicking an existing **custom map** in "Your Maps"; shows that map's **source** (its `function(pixelCount)`), carries its own header/buttons, and gets a parse-based compile badge. Stock maps are never opened here — their code is reached only by loading a **template** into a New Map. Distinct from assigning a map to a pattern (the preview's **Layout** dropdown) — opening a map for editing shows the map's **bare geometry** in the preview (the point cloud, no pattern), sidestepping pattern/map dimensionality mismatch.
_Avoid_: map editor (fine in prose, but the canonical term for the editor's state is map mode).

**Square** (the stock plane; UI label):
The default stock 2D **map** — a uniform square grid of glowing LED dots. Squares a bare pixel count up (`cols = ceil(sqrt(n))`) precisely because a count carries no aspect to honour; a **custom map** that *does* carry an aspect is a different, non-square entry. Its dropdown **label is "Square"** (not "Plain 2D" — which lied, since it always coerced to a square); its internal id stays `plane`. Historically this *was* the whole preview (a single global grid, the 2D-only era); now it is one map among many, and the old preview-wide `grid: {rows, cols}` state is retired — the active map's resolved geometry is the sole source of the preview's extent and aspect (ADR-0009). `rows`/`cols` survive only as this generator's private parameters. Its internal pixel *pitch* (fit-to-container `spacing`) is a pure layout detail, distinct from **preview light size** — the pitch positions the dots, light size only scales how large they're drawn.
_Avoid_: "Plain 2D" (the old label; coerced to square, so it misnamed); "preview grid" / "the grid" as a global preview concept (there is no global grid anymore — there is the active map's geometry).

**Aspect normalization** (ADR-0009):
The single shared pass that maps a map's raw geometry into `[0,1]`. It runs in one of two **Fill/Contain modes** (#174) — both real, faithful Pixelblaze Mapper behaviour, a **per-pattern** user choice (persisted on `PatternRecord.normalize`, displayed in the deck's **Pixelblaze** group), defaulting to **Contain**:
- **Contain** (default): **aspect-preserving, anchored to the longest axis** — the longest axis fills `[0,1]`, shorter axes get a proportionally smaller range (a 15×10 map → long axis `0..1`, short `0..0.667`), so no axis exceeds `1.0`. The preview draws the map's true rectangle/box *and* the pattern reads its true proportions, so a circle pattern looks like a circle on a non-square map.
- **Fill**: **per-axis stretch** — each axis normalizes *independently* to `[0,1]`, so a 4:1 map fills the unit square (the pre-#116 behaviour, recovered). Verified on hardware against a `y >= 0.9` test pattern: under Fill `y` reached `1.0`, under Contain it capped low.

Applied **identically to `sample` and `pos`** in either mode. Implementation: `normalizeAspect` (Contain) and `normalizeFill` (Fill) in `src/engine/maps/normalize.ts`; `applyNormalizeMode` re-stretches resolved Contain points to Fill live (idempotent-equivalent on Contain output, so no re-bake). "The map is authoritative" — whatever the map's geometry says, the preview obeys; pixel count never overrides shape (ADR-0004).
_Avoid_: calling Contain "the only behaviour" (Fill is equally real — ADR-0009 originally hardcoded Contain, #174 reopened it); "stretch to fit" for Contain (that's Fill).

**Dimensionality** (of a pattern or map):
Which of **1D / 2D / 3D** a pattern runs as, or a map supplies — always the **display/layout** dimension, never a coordinate-argument count. Named by the render fn via a bijection: `render` → 1D, `render2D` → 2D, `render3D` → 3D. A `render()` pattern is **1D** even though it takes zero coordinates, because a strip of LEDs is inherently a 1D layout. A pattern's dimensionality is the highest render fn it defines.
_Avoid_: sampling dimensionality (collapses display dimension with arg count — they differ), dimension count.

**Sample / position** (of a map point):
Two independent per-point channels. **sample** — the coordinates fed to the render fn (`[]` for 1D, `[x,y]` for 2D, `[x,y,z]` for 3D); always owned by the **map**. **pos** — where the dot is *drawn* (a 2D or 3D point). `pos` is **dual-sourced**: *map-intrinsic* when the map encodes real geometry (grid, cube, a measured installation), but *viewport-supplied* when the pattern leaves position free (a 1D `render()` pattern, whose `sample` is empty — see **Shape**). They coincide for a flat grid; they diverge for a ring (sample `[]`, pos a 2D circle, viewport-supplied via a **Shape**) or a 2D map wrapped onto a cylinder (sample `[x,y]` from the map, pos 3D, viewport-supplied via a **Surface** — ADR-0010). The viewport-supplied case now spans both 1D shapes and 2D surfaces.
_Avoid_: using "coordinates" unqualified — say sample or pos.

**Shape** (1D viewport embedding):
The cosmetic path a **1D** pattern's pixels are *drawn* along — line, ring, pole (helix). Because a 1D `render()` pattern's `sample` is empty, the shape changes only `pos`, never what the pattern computes, so it belongs to the **viewport**, not the map. A shape's display dimension may exceed the pattern's (a 1D pattern on a pole displays in 3D). The **Surface** is its 2D sibling — same kind of thing (a viewport embedding owning `pos`), one dimension up. Selected in the preview's **embedding** dropdown (the second control), which shows shapes for a 1D pattern.
_Avoid_: calling a 1D shape a "map"; calling a 2D/3D map a "shape"; using "shape" for the 2D embedding (that is a **Surface**).

**Surface** (2D viewport embedding):
The 3D form a **2D map's** flat field is *drawn* on — **flat** (the identity surface, today's plain 2D preview) and **cylinder** (a tube). The 2D sibling of **Shape**: it owns `pos` (where each dot is drawn in 3D) while the **map** keeps owning `sample` (the `[u,v]` the pattern reads) — the §**Sample / position** divergence, made first-class. A surface consumes the map's aspect to set its geometry (a square field wraps to a tall slender cylinder, a 2:1 field to a fatter shorter one). Because a 2D pattern's `sample` is *non-empty*, a surface must be **composed with a source map** — which is why 2D shows two controls (**Map** + the embedding dropdown, here populated with surfaces) where 1D shows one. "Flat" is just the trivial member, so today's plain 2D preview is the identity entry of this family, not a separate kind. The **cylinder** is therefore an embedding, **not** a map (ADR-0010, superseding the ADR-0009/0008 "drape cylinder is a stock-map exception" framing — see those ADRs' cylinder notes). **Only *developable* forms qualify as Surfaces** (ADR-0012): a 2D field has no interior, so it can only wrap distortion-free onto a form that unrolls to a plane — the cylinder. A **sphere** can't (any wrap needs a pole-singular, area-distorting projection) and a **cube** can't usefully (a cube net accepts only square-per-face grids, not an arbitrary `cols×rows` map), so both live as 3D **shell / volume** maps instead, not Surfaces. The Surface family is therefore **Flat + Cylinder only**; the retired **surface-cube** (#167/#168) count-distributed across faces without honouring its map and is gone.
_Avoid_: calling a surface a "map" (it owns `pos`, not `sample`); "drape" / "drape cylinder" (the cylinder is one surface among several now); reusing "shape" for it; treating sphere/cube/torus as Surfaces (ADR-0012 — they are 3D maps).
_See also_: **Solidity** — the **cylinder** surface supplies a **surface normal** and is **solid-eligible**; the flat identity surface is not (it faces the camera); **shell** maps are the *other* solid-eligible family.

**Shell / volume** (3D-map geometry, ADR-0012):
The two ways a **3D map** (`sample = [x,y,z]`, hardware-real) can distribute its points — orthogonal to the **Surface** mechanism, which only ever wraps a *2D* map. A **shell** puts points on a boundary (Sphere shell, Cube shell, Star shell); a **volume** fills the interior (Sphere volume, Cube volume, Star volume). The catalogue suffixes the label — "Cube (shell)" / "Cube (volume)" — whenever a shape ships in both forms. A **shell** map is **solid-eligible** (it supplies a per-point outward normal: face normals for a faceted shell, generic `normalize(pos − centroid)` for a convex one — see **Solidity**, **Surface normal**); a **volume** map never is (no boundary normal). A **wireframe** (points along edges, e.g. the retired star) or an **irregular cloud** (a measured tree) is neither shell nor volume and not solid-eligible.
_Avoid_: "cloud" for a *filled volume* (cloud means an *irregular measured* set — overloading it collides); "solid" for the filled distribution (it collides with the **Solidity** slider — say **volume**).

**Viewport** (or **camera**):
The display side of the preview — orbit/turntable, fit-to-container, depth cueing, **preview light size**, the **diffusion** blur, **solidity**, and (for 1D) the shape embedding. Owns everything about *how* pixels are drawn; owns nothing the pattern can observe (light size, diffusion, solidity, and shape stay invisible to a pattern because `sample` is normalized independently). The viewport's control set is gated on the *display* dimension (a 3D embedding shows orbit controls even for a 1D pattern), not the pattern's dimensionality.
_Avoid_: conflating viewport light size with map geometry — neither light size, diffusion, nor solidity ever reaches `sample` or the hardware.

**Solidity** (ADR-0011):
A preview-only, **per-pattern** display property of any normal-bearing embedding: a continuous slider `0 = transparent → 1 = solid` that suppresses **back-facing** points so a solid object hides its own back, while `0` is exactly today's see-through draw (the points hung on glass / wire mesh / in free space). Defined by the presence of a per-point **surface normal**, which spans two families (ADR-0012): the **Cylinder** Surface embedding (analytic radial normal), and every **shell** 3D map (Sphere shell, Cube shell, Star shell). Ineligible: flat embeddings (Line, Ring, Flat) trivially face the camera; **volume** maps (Cube volume, Sphere volume, a measured cloud) and wireframes have no boundary normal. Eligibility is **provenance-gated**, not geometry-inferred: a normal is available only because the IDE owns the generator (analytic embeddings emit it from their formula; a faceted shell emits face normals; a convex **shell** stock map carries a `solidEligible` flag and the preview re-derives `normalize(pos − centroid)`), so a hand-imported sphere-shaped cloud is never solid-able — the **Stock map** vs **Custom map** provenance split, applied to normals. Mechanically a soft **terminator fade**: a `normal · viewDir` brightness multiplier folded into `project3D` beside the **depth cue** (a geometric visibility factor, *not* the **brightness** control — front-facing points are never touched; the slider sets the floor the back fades to). Default `1.0`; a **recommended solidity** (`demoName → number`, the recommended-map / recommended-count registry family) sets a **demo**'s on-open value. Persisted on `PatternRecord` beside `surfaceId`; **never** serialized to a **controller** (per-pattern and hardware-bound are orthogonal axes).
_Avoid_: "opacity" (collides with alpha-blending and reads as a **diffusion** sibling); "back-face culling" (names the hard-cull mechanism rejected for the soft fade — see ADR-0011); treating it as a global viewing-comfort pref like light size / diffusion (it is per-pattern, intrinsic to *what the object is*).

**Surface normal** (or **normal**, preview-side):
The per-point outward unit vector a solid-eligible embedding or **shell** map supplies so the preview can compute **solidity**. Preview-only — re-derived from the generator (the cylinder's analytic radial formula; a faceted shell's face normals; or `normalize(pos − centroid)` for a flagged convex **shell** stock map), **never** stored in a **map** record or sent to a **controller** (a Pixelblaze map is positions only). Absence of a normal is exactly what makes an embedding or map solid-ineligible (Flat, every **volume** map, wireframes).
_Avoid_: implying a normal lives in the map or reaches hardware (it is a viewport construct).

**Preview light size** (or **light size**):
A purely cosmetic viewport control setting how large each drawn light source (the glowing dot in 1D/2D, the orb in 3D) appears, as a fraction of the inter-dot pitch — so "almost touching" lands at the same felt point in every dimension regardless of pixel count or camera zoom. It grows the light sources *in place*: positions and the layout's extent never move (the line keeps its length, the plane/cube keep their bounds). A preview-only construct — never serialized into a **map** and never sent to a **controller** (that physical density is the map's job, not this). A **hybrid comfort pref** in the **settings cascade** (ADR-0013): a user **global-sticky** baseline (set once, applies everywhere) that a curated pattern may **recommend** and that the user may **override** per-pattern.
_Avoid_: "spacing" (the old name — it implied moving the dots apart, which it never did); "LED size" / "dot size" (read as hardware or undersell the 3D orb); conflating with **diffusion**; calling it "global, not per-pattern" (ADR-0013 made it hybrid — superseding the ADR-0006 framing).

**Diffusion**:
A purely cosmetic viewport control blurring the drawn light sources together, like a physical diffuser over real LEDs. At 0 the sources are crisp and individually distinct; at full diffusion they merge into an opaque field with no individual source visible. Strictly independent of **preview light size** (it never changes a source's size) and of **brightness** (the field never looks darker overall as diffusion rises — energy is conserved; peaks may soften but nothing dims). Mechanism may differ per display dimension so long as the *feel* is uniform across 1D/2D/3D. Preview-only — never serialized into a **map** or sent to a **controller**. A **hybrid comfort pref** in the **settings cascade** (ADR-0013): a user **global-sticky** baseline that a curated pattern may **recommend** (a foggy plasma that looks wrong crisp) and that the user may **override** per-pattern.
_Avoid_: "glow" (the old PRD term); letting diffusion change brightness or source size; calling it "global, not per-pattern" (ADR-0013 made it hybrid — superseding the ADR-0006 framing).

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
