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

**[Open PXLBLZ →](https://jon-whiteroomsoftware.github.io/pixelblaze-v2/)**

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

Everything is offline-first. The only thing the IDE can't do without a device is talk
*to* the device — and even that is bridged by Copy/Download (see "Getting patterns on
and off hardware").

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

- **Stock maps** ship ready to use: **Square**, **Wide 2:1**, **Ring**, **Cube
  (shell)** and **Cube (volume)**, **Sphere (shell)** and **Sphere (volume)**, **Star
  (shell)** and **Star (volume)**. "Shell" maps put LEDs on the
  surface of the shape; "volume" maps fill the interior.
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
pattern reads. The IDE splits this into up to two dropdowns next to the pattern name:

- A **Map** control (for 2D and 3D patterns) — picks the geometry your pattern reads.
- An **embedding** control — picks how it's drawn. For a **1D** pattern this offers
  **shapes**: a straight **line**, a **ring**, or a **pole** (a helix wound around a
  cylinder, with an adjustable wrap density). For a **2D** pattern it offers
  **surfaces**: **Flat** (the ordinary grid) or **Cylinder** (the grid wrapped onto a
  tube). The cylinder's proportions come from your map's aspect — a square map makes a
  tall slender tube, a 2:1 map a fatter one.

So a 1D pattern shows one control, a 2D pattern with a wrappable map shows two, and a
3D pattern shows just the map. Controls that offer no real choice are hidden. Your
selection is remembered per pattern.

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
  a controller: **pixels** (the count — a single number; the map arranges it, e.g.
  the Square map squares it up) and **fit** (Fill/Contain) on top, with **brightness**
  below.
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

A play/pause toggle sits by the pattern name; the preview runs by default.

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

The left rail holds three kinds of things:

- **Your patterns** — created, renamed, and deleted by you; stored in the browser
  (IndexedDB), so they persist between sessions with no account or cloud. A new
  pattern starts from a runnable animated starter.
- **Libraries** (read-only, click to view the source):
  | Library | What it provides |
  |---|---|
  | `SDF` | 2D signed distance fields — circles, rects, rings, stars, polygons, smooth boolean ops |
  | `Anim` | Easing curves, oscillators, phase timing, looping primitives |
  | `Color` | HSV/RGB blends, palette interpolation, colour math |
  | `Coord` | Polar coordinates, rect↔polar conversion, transforms |
  | `Noise` | Value noise, organic variation (hashes made hardware-safe) |
  | `Shader` | GLSL gap-fillers (`fract`, `step`, `dot`, `reflect`, palettes, integer hashes) for shader ports |
- **Demos** — ready-to-run examples: shader ports, eased sweeps, noise fields, and
  per-dimension test patterns. The *code* is read-only, but **Edit** forks any demo
  into your own editable copy. Some demos open on a recommended map, pixel count, and
  solidity (e.g. the sphere demos open as dense, solid spheres) — defaults only;
  everything stays switchable, and your changes to a demo's preview settings are
  remembered for that demo (its code stays read-only). Forking takes a snapshot of how
  the demo looks *right now* into your copy, with no live link back: later tweaks to
  the demo's recommended look won't change your fork.

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

## Getting patterns on and off hardware

- **Copy Code / Download.** The IDE emits a single flat `.js` file — every library
  function you used inlined, `export`s preserved — in exactly the format the device
  expects. Paste it into the built-in Pixelblaze editor, or download it to upload.
  (Disabled while your code has a compile error.)
- **Import.** Open `.epe` files exported from the Pixelblaze hardware editor; they
  land as new editable patterns.

Direct over-the-network upload to a controller isn't wired into the app — a deployed
web page can't reach a `ws://` device directly (see the Ecosystem Primer §7) — so for
now **Copy Code is the bridge**.

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
