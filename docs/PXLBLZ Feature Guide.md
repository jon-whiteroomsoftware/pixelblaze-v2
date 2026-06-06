# PXLBLZ — Feature Guide

This is the guide for someone who **uses Pixelblaze** and wants to know what
**PXLBLZ** does for them — what's on the screen, what each control means, and how the
whole thing fits the way a real Pixelblaze works. It assumes you already understand
Pixelblaze concepts (patterns, maps, controls, fixed-point); if you don't, read the
**Pixelblaze Ecosystem Primer** first. It says nothing about how PXLBLZ is *built* —
for that, see the **PXLBLZ Technical Reference**.

---

## What it is, in a sentence

A browser-based pattern editor for Pixelblaze that lets you **write, preview, and
tune patterns entirely offline** — no controller, no network, no install — and then
paste or download the result straight onto your device.

**[Open PXLBLZ →](https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/)**

---

## Why you'd use it instead of the on-device editor

The editor built into every Pixelblaze is functional but bare. PXLBLZ exists to
fix three specific limitations:

1. **It needs no hardware.** The stock editor only works with a controller powered up
   and on the network. This one runs the whole loop — editing, compiling, and a live
   animated preview — in your browser. You can develop patterns on a plane.
2. **It's a real editor.** Instead of a plain text box, you get Monaco (the engine
   behind VS Code): autocomplete, signature hints, and live error-checking that knows
   the Pixelblaze dialect and flags constructs the firmware won't accept *before* you
   ever upload.
3. **It has reusable libraries.** The stock editor makes every pattern self-contained
   — no shared code. Here you can call `SDF.circle(...)` or `Anim.ease(...)` from a
   bundled library, and the IDE inlines only what you actually use into the exported
   file, keeping it small enough for the device.

Everything is offline-first: editing, compiling, and previewing never need a device or
a network. When you *do* have a Pixelblaze on your LAN, the IDE can also **connect to
it live** — read its state, drive its controls, and push patterns and maps straight to
it — through a small browser extension (see "Connecting to a Controller"). And with no
device at all, Copy/Download still bridges your work onto hardware by hand.

---

## The preview — the heart of the IDE

The preview is not a rough approximation. It is built to match what your hardware
will actually do, across all three dimensionalities.

### It renders 1D, 2D, and 3D

The IDE reads your render functions and figures out the pattern's dimensionality
automatically: a `render()` pattern is 1D, `render2D` is 2D, `render3D` is 3D. Then
it draws the pattern on a configurable arrangement of glowing LED dots you can watch
animate in real time.

For 3D patterns (and for 1D/2D patterns wrapped onto a 3D form) you get an **orbit
viewport**: it auto-spins by default, you can drag to turntable it, Shift-drag to
free-tumble, and reset the view. Nearer dots are drawn larger and brighter (depth
cueing) and properly occlude the ones behind, so a sphere reads as a sphere.

### The map is yours, not the device's

Just like real hardware, a **pixel map** describes where each LED physically sits,
decoupled from its order in the chain. You choose what your pattern previews against:

- **Stock maps** ship ready to use: **Square**, **Wide 2:1**, **Ring**, **Cube shell**
  and **Cube volume**, **Sphere shell** and **Sphere volume**, **Star shell** and **Star
  volume**, and **Tetra shell** and **Tetra volume** (a four-sided die / d4). "Shell"
  maps put LEDs on the surface of the shape; "volume" maps fill the interior.
- **Custom maps** — click **New Map** and you get an editor on a plain
  `function(pixelCount)`, *exactly* the thing a real Pixelblaze Mapper tab evaluates.
  Write the geometry of your actual tree, sphere, or sculpture and preview your
  pattern against it. (Because it's the real Mapper dialect, it's full JavaScript with
  `Math.*` — not the pattern dialect. The IDE handles the difference.) Author in
  whatever units fit the build — inches, millimetres, raw pixels — and it scales
  itself; the firmware derives the world's extent from your coordinates' limits and
  normalizes to `0..1`. (Hardware's Mapper also accepts a hand-written JSON array of
  coordinates for irregular layouts; the IDE's editor is the function flavor.)
- **Templates** — every stock map is real, pasteable Mapper code with no hidden magic.
  Use "Load template" in the New Map editor to start a custom map from any stock one.

Custom maps auto-bake as you edit (the same once-at-save evaluation hardware does),
and **Deploy to preview** pushes a finished map onto the running pattern.

### How the layout controls work

Where each dot is *drawn* is a display choice, separate from what coordinates your
pattern reads. The IDE splits this into two controls, deliberately placed to make the
real-versus-viewport boundary legible:

- A **Map** control (for 2D and 3D patterns) — picks the geometry your pattern reads.
  It lives **inside the PIXELBLAZE block** of the control deck, alongside the other
  settings a real device would carry (it's a stacked, full-width field, since map names
  are long). For a **1D** pattern there is no map at all — the Map control is absent
  entirely, not just disabled.
- An **embedding** control — picks how it's drawn. It sits on the **transport row**
  next to the play/pause toggle (a viewport affordance, not a device setting). For a
  **1D** pattern this offers **shapes**: a straight **line**, a **ring**, or a **pole**
  (a helix wound around a cylinder, with an adjustable wrap density). For a **2D**
  pattern it offers **surfaces**: **Flat** (the ordinary grid) or **Cylinder** (the
  grid wrapped onto a tube). The cylinder's proportions come from your map's aspect — a
  square map makes a tall slender tube, a 2:1 map a fatter one.

So a 1D pattern shows just the embedding (no map), a 2D pattern with a wrappable map
shows both, and a 3D pattern shows just the map. Controls that offer no real choice are
hidden. Your selection is remembered per pattern.

### Hardware-faithful math: Fast vs. Precise

Pixelblaze runs 16.16 fixed-point, not floats — and that difference is exactly where
ported GPU shaders break (a big-number hash that looks perfect in floating point
overflows and turns to noise on the device). The preview's **renderer** toggle lets
you choose:

- **Fast** (the default) — plain float64. Smooth and good enough for everyday
  editing.
- **Precise** — emulates the controller's exact 16.16 arithmetic: overflow,
  precision loss, bitwise semantics and all, validated against a real device. Flip to
  Precise when you need to trust that what you see is what the device will do.

A couple of honest caveats: `perlin` and the random functions are *different
algorithms* from firmware, so they diverge slightly even in Precise mode (pure
integer math is bit-identical). And Precise is slower — that's why Fast is the
default.

### Light size, diffusion, and solidity

Three preview-only viewing controls shape how the dots *look* (none of them touch
your pattern's math or ever reach hardware):

- **Light size** — how big each light source is drawn, as a fraction of the spacing
  between dots. It grows the dots in place; it never moves them or resizes anything.
- **Diffusion** — blurs the sources together like a physical diffuser sheet over real
  LEDs. At 0 they're crisp and distinct; turned up, they merge into a smooth gap-free
  field. It never changes a source's size and never dims the overall image.
- **Solidity** — appears only for shapes that have a front and a back (a sphere shell,
  a cube shell, a cylinder, a pole). It fades out the back-facing dots so a solid
  object hides its own back, on a slider from transparent (see straight through, like
  LEDs on glass or wire mesh) to fully solid.

Light size and diffusion are *comfort* settings: the value you dial in becomes your
default for every pattern (set once, stays set), unless a particular pattern needs its
own — then your adjustment on that pattern sticks to just that pattern. Solidity is
always *per-pattern*: it's part of what the object *is*, not a viewing preference.

### Fill vs. Contain

The **fit** control mirrors the Pixelblaze Mapper's own Fill/Contain dropdown — both
are real device behaviours, chosen per pattern:

- **Contain** (default) keeps your map's true aspect ratio (a circle stays a circle on
  a non-square map).
- **Fill** stretches each axis independently to fill the unit square.

### The control deck, at a glance

Below the canvas, controls are grouped by what they *are* — a distinction the IDE
makes visible:

- **Pixelblaze group** — settings that exist on real hardware and would round-trip to
  a controller: the **map**, **pixels** (the count — a single number; the map arranges
  it, e.g. the Square map squares it up), **fit** (Fill/Contain), and **brightness**.
  The map is a stacked, full-width field; for a 1D pattern the map and fit are absent
  entirely, leaving just pixels and brightness. The brightness slider is
  **logarithmic** — its travel devotes more of the track to the dim end, where small
  changes matter most, while still reading and writing plain `0..1` brightness.
- **Preview group** — things the IDE's renderer invents and the device never sees,
  with the live read-only telemetry folded in at the top: **fps**, **elapsed** time,
  and the active **layout**'s dimensions, then **renderer** (Fast/Precise) and
  **speed** (0.1×–2× playback via a virtual clock), then the viewing sliders **light
  size**, **diffusion**, and **solidity** (when applicable). A **rewind icon** next to
  the section title pops in whenever you've changed a setting from its default, and
  resets the preview with one click (see below).
- **Pattern controls** — the sliders, toggles, and colour pickers your pattern
  exports (see below).
- **Watch variables** — the var watcher (see below).

A play/pause toggle sits on the transport row, with the embedding (shape/surface)
control beside it; the preview runs by default.

---

## Live controls and the var watcher

These reproduce two things you'd see on the device's own UI:

- **Pattern controls.** Export a `sliderX`, `toggleX`, `hsvPickerX`, or `rgbPickerX`
  function and the IDE renders the matching widget — the same controls the hardware
  shows — and feeds your function the values live. (The output-style controls
  `showNumber`, `gauge`, plus `trigger` and `inputNumber`, are recognised but don't
  yet render a widget; the pattern still loads and runs.)
- **Watch variables.** Turn on the var watcher to see the live value of every `export var`
  in your pattern, refreshed each frame — arrays shown element by element, just like
  the on-device Var Watcher.

---

## The editor

Monaco in a Pixelblaze language mode:

- **Autocomplete and signature hints** for the full built-in surface and for every
  function in the bundled libraries.
- **Live error checking.** As you type, the IDE flags both syntax errors and
  Pixelblaze-specific violations — using `let`/`const`/`class`/`new`/`switch`/`try`/
  `throw`/`import`, the things the firmware rejects — as inline markers, plus a
  Good/Broken status badge. Broken code keeps the last good version running in the
  preview rather than blanking it.
- **Hover cards** on library functions with usage summaries.
- It quietly **auto-saves** your work to the browser's local storage, and pushes
  clean changes to the preview as you pause typing.

The editor also doubles as the **map editor** (map mode) when you're writing a custom
map — there it's a plain-JavaScript surface with its own parse-checking badge and the
Load template / Deploy controls.

---

## Patterns, libraries, and demos

The left rail holds **your patterns**, **your maps**, and the **demos**; the
**libraries** moved out of the rail into a dropdown in the header (see below). At the
top of the rail is a **filter row** that combines two things:

- A **dimension lens** — a single-select **All / 1D / 2D / 3D** filter. Pick a
  dimensionality and the rail shows only patterns, maps, and demos of that native
  dimension (a pattern's dimension is the highest render function it defines). Under the
  1D lens the Your Maps section disappears entirely (1D has no maps); empty demo
  subsections are hidden rather than left as bare headers. The lens is ephemeral — it
  resets to All on reload, and the active pattern stays loaded even when filtered out of
  view.
- A **type-down name search** — a magnifier on the right of the same row expands into a
  search box; type to filter by name. It AND-combines with the dimension lens (both must
  match). An active query force-expands any collapsed groups to surface hits, restoring
  their collapse state when you clear it. Clicking the magnifier opens and focuses the
  box; once open it becomes an X that clears and closes; clicking anywhere else in the
  IDE also closes it.

What's in the rail:

- **Your patterns** — created, renamed, and deleted by you; stored in the browser
  (IndexedDB), so they persist between sessions with no account or cloud. A new
  pattern starts from a runnable animated starter.
- **Your maps** — your custom maps (see "The map is yours").
- **Demos** — ready-to-run examples: shader ports, eased sweeps, noise fields, and
  per-dimension test patterns. The *code* is read-only, but **Edit** forks any demo
  into your own editable copy. Some demos open on a recommended map, pixel count, and
  solidity (e.g. the sphere demos open as dense, solid spheres) — defaults only;
  everything stays switchable, and your changes to a demo's preview settings are
  remembered for that demo (its code stays read-only). Forking takes a snapshot of how
  the demo looks *right now* into your copy, with no live link back: later tweaks to
  the demo's recommended look won't change your fork.

### Libraries (in the header)

The bundled libraries live in a **Libraries** dropdown in the header's left zone, beside
the PXLBLZ wordmark (the header's spatial grammar: identity and authoring reference on
the left, hardware and preview on the right). Open the menu and click a library to view
its source read-only in the editor (and its API surface appears on hover). The menu also
lists **PixelBlaze**, the built-in surface, which is hover-only documentation with no
source to open.

| Library | What it provides |
|---|---|
| `SDF` | 2D signed distance fields — circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim` | Easing curves, oscillators, phase timing, looping primitives |
| `Color` | HSV/RGB blends, palette interpolation, colour math |
| `Coord` | Polar coordinates, rect↔polar conversion, transforms |
| `Noise` | Value noise, organic variation (hashes made hardware-safe) |
| `Shader` | GLSL gap-fillers (`fract`, `step`, `dot`, `reflect`, palettes, integer hashes) for shader ports |

Once you adjust a pattern's *or a demo's* preview settings, those tweaks are remembered
with that pattern (or demo) and restored next time you open it. The **rewind icon** by
the Preview section header appears once you've changed anything from its default; click
it to reset the whole preview at once — a user pattern drops back to the app defaults, a
demo reverts to how its author recommended it. Your personal light-size and diffusion
comfort baseline isn't touched by a reset (that's a global preference, not part of the
pattern).

---

## Porting GPU shaders

Because the Precise renderer lets you trust the preview against real fixed-point
behaviour, the IDE is a comfortable home for porting ShaderToy-style GLSL onto LEDs.
The `Shader` library fills the genuine GLSL gaps (`fract`, `step`, `sign`, vector
helpers, IQ palettes, and integer hashes that *don't* overflow on the device), and
there's a dedicated **[porting guide](guides/Porting%20ShaderToy%20shaders%20to%20Pixelblaze.md)**
that walks through the idioms that translate, the ones that need rewriting, and the
GPU-only features that simply won't port (textures, multipass feedback, `dFdx`, etc.).
Porting is human-driven with library support — there's no automatic GLSL converter.

---

## Connecting to a Controller

When a Pixelblaze is on your LAN, the IDE can talk to it live. A deployed web page can't
reach a `ws://` device by itself (see the Ecosystem Primer §7), so this works through a
small **Chrome extension** that relays the connection. Install it once (unpacked, from
the `extension/` folder — see its README), and a connection surface appears top-right.
Before anything is connected it reads as a **Connect** button (a two-prong plug glyph
plus the word "Connect"), the same visual family as the pill it becomes once a device is
attached.

- **Find your Controller.** Open the connect dropdown (top-right) and you get two ways in:
  - **Discover.** The dropdown lists Pixelblazes it found on your network, by name. A
    browser can't scan the LAN itself, so discovery goes through Pixelblaze's cloud
    finder (the same service the official tools use) — your devices just need to have
    reached the internet at least once. The list runs automatically when you open the
    dropdown and refreshes itself periodically; a **rescan** button (it spins while
    working) forces a fresh look. Click a device to connect to it.
  - **By IP.** If you know the Controller's LAN address, type it in and connect. This
    always works, even if cloud discovery can't see the device.
- **Grant access, once per device.** The first time you connect to a given Pixelblaze,
  the extension surfaces Chrome's native **"Allow access to `<ip>`?"** prompt — approve
  it once and that device is remembered. (Connecting to several discovered devices can
  batch their prompts into one.) This per-device grant is what lets the extension be
  least-privilege rather than asking for blanket network access.
- **Connect and status.** The status dot reads at a glance: **dark grey** = the extension
  isn't installed; **grey** = installed but nothing connected; **amber, blinking** =
  connecting; **green** = connected; **red** = a connection error. Each connected
  Controller gets its own **pill** showing its **name** — the IDE remembers the name, so
  the pill reads "burner-bag" rather than a bare IP, even mid-connect or right after a
  reload. The connection **reconnects on its own** if the device blips off and back.
  Click a pill to make it active and open its panel; you can keep more than one connected.
- **The live panel** (a pinned popover under the active pill) mirrors the device in real
  time. It's laid out in rows: the **active pattern** name and a **brightness** slider on
  top; the installed **map's point count** and the **pixel count** next; the device's
  **IP** and **frame rate** last. The map-points figure is flagged amber when it
  disagrees with the pixel count (a mismatched map is silently ignored by the firmware,
  so this makes the footgun visible). The **pixel count is editable** — committing a new
  value saves it to the device (it's the only way to make a fixed-size map apply); the
  input holds your entered value, dimmed, while the slow saved write is in flight, so a
  mid-write poll can't flash the old count back. The **brightness** slider (logarithmic,
  like the preview's) and the running pattern's **live controls** drive the device
  directly; these are volatile (not written to flash, to spare it). A control whose
  device value can't be read as a real `0..1` position — a run-only pattern reports none,
  and a saved pattern reports the bound variable's mutated value, not a slider position —
  shows an **indeterminate** hollow-ring state with a `—` readout, still draggable so you
  can set it. Closing and reopening the *same* device's panel shows its last-known values
  immediately rather than flashing blank; switching to a different device clears first.
- **Send to Controller** (a button in the editor header) compiles the open pattern with
  the *device's own compiler* and pushes the result to the Controller. A **Save toggle**
  beside the button picks the mode, and the button's glyph and tooltip follow it:
  - **Run** (default) — load and run the pattern transiently. It plays immediately but is
    **not** added to the device's Saved Patterns; its name lives only in the IDE.
  - **Save** (toggle armed) — persist the pattern to the device's Saved Patterns *and*
    activate it, so it shows up named in the saved list and starts running. Save
    **overwrites in place** — repeated Saves update the same on-device program instead of
    piling up copies.

  Run and save are tracked independently, so a clean run push doesn't satisfy a pending
  save (flip the toggle and Send re-arms). Send is enabled when a Controller is connected
  and the pattern compiles cleanly; if the IDE can tell the pattern's dimensionality won't
  match the device's installed map, it says so. **Demos can be sent directly** — no need
  to fork one into your own patterns first. (There's no longer a pre-push heads-up about
  pixel-count differences: a pattern push sends bytecode only and keeps the device's
  existing map, so a count mismatch is just "this won't look right," not something to
  block on.)
- **Send map to Controller** (in the map editor) writes the open custom map to the
  device's single shared map slot — a deliberate, confirm-first action, since one map is
  shared by every pattern on the device. The IDE re-bakes the map to the device's exact
  pixel count first, because the firmware drops any map whose point count doesn't match.

This is all **additive** — nothing about connecting changes the offline workflow, and
nothing the preview invents (light size, diffusion, solidity, the fast/precise choice)
is ever sent to the device; only the pattern and, when you ask, the map.

---

## Getting patterns on and off hardware by hand

When you don't have a live connection (no device, no extension, or just by preference):

- **Copy Code / Download.** The IDE emits a single flat `.js` file — every library
  function you used inlined, `export`s preserved — in exactly the format the device
  expects. Paste it into the built-in Pixelblaze editor, or download it to upload.
  (Disabled while your code has a compile error.)
- **Import.** Open `.epe` files exported from the Pixelblaze hardware editor; they
  land as new editable patterns.

---

## Good to know

- **Patterns run on your browser's main thread.** A genuinely infinite loop can freeze
  the tab — there's no watchdog like the real hardware has. The IDE reduces the risk by
  only running code that compiles cleanly, but a valid-but-infinite loop will still
  hang.
- **`perlin` and the random functions diverge slightly** from firmware even in Precise
  mode; they're different algorithms, not reverse-engineered. Pure integer math is
  bit-identical on both sides.
- **Sound- and sensor-reactive patterns load and run**, but the sensor inputs (the
  sound FFT, accelerometer, light sensor) are inert stubs here, so those patterns
  won't animate from audio or motion in the preview.
- **Everything is per-browser.** Your patterns and settings live in this browser's
  local storage. There's no account and no sync between machines.
