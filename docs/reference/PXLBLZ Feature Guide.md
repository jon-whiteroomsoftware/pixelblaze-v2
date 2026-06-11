# PXLBLZ — Feature Guide

For people who use Pixelblaze and want to know what **PXLBLZ** does for them. It
assumes you know the Pixelblaze concepts — patterns, maps, controls, fixed-point;
if you don't, read the **Pixelblaze Ecosystem Primer** first. How PXLBLZ is *built*
is the **PXLBLZ Technical Reference**'s job.

**The whole document in two sentences.** PXLBLZ is a browser-based pattern editor
for Pixelblaze that lets you write, preview, and tune patterns entirely offline —
no controller, no network, no install — and then put the result onto your device,
either by hand or over a live connection. The preview is built to be faithful to
real hardware (down to optional 16.16 fixed-point emulation), and everything the
IDE invents for previewing stays in the browser: only patterns and maps ever reach
a controller.

**[Open PXLBLZ →](https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/)**

**Part 1** is the tour — what's on the screen and what it's for. **Part 2** is the
reference — exact control semantics, what sticks where, and the full Controller
details.

---

# Part 1 — Tour

## 1. What it does — and doesn't

PXLBLZ is a modern IDE for Pixelblaze patterns. It sits alongside the on-device
editor rather than replacing it — it deliberately doesn't mirror every device
function, and the device's own web UI remains the place for device management.

### What's different about it

- **It needs no hardware.** The whole loop — editing, compiling, a live animated
  preview faithful to the device's fixed-point math — runs in your browser. A
  controller is a deploy target, not your workspace. You can develop patterns on
  a plane.
- **Your work lives off the device.** Patterns and maps are saved outside
  Pixelblaze hardware, so they aren't tied to any one controller's storage
  (§10).
- **Modern IDE features.** Monaco (the engine behind VS Code) with autocomplete,
  signature hints, and hover API cards for the built-ins and libraries;
  background compilation with inline error markers that know the Pixelblaze
  dialect (broken code keeps the last good version running in the preview);
  quiet auto-save (§9).
- **Reusable libraries.** Call `SDF.circle(...)` or `Anim.ease(...)` from a
  bundled library; export inlines only what you actually use, keeping the
  artifact small enough for the device (§5).
- **A first-class Controller connection.** With a Pixelblaze on your LAN you can
  discover and connect to it, mirror its state live, drive the running pattern's
  controls in real time, and push patterns and maps (§6, §11).
- **A bench harness.** Scripted, repeatable benchmarking that runs a pattern
  under the emulator or pushes it to a real controller and reads back FPS. Not
  covered in this guide — see **Optimizing Pixelblaze patterns**.

### What else you can do

- Import `.epe` files exported from the hardware editor or downloaded from the
  pattern library site (§7).
- Copy or download a flat, tree-shaken `.js` of your pattern plus the library
  code it uses, ready to paste into the device editor (§7).
- Preview in 1D, 2D, and 3D, with an orbit viewport and a Fast/Precise
  fixed-point renderer toggle (§3).
- Author custom maps in real Mapper JavaScript, and push stock or custom maps to
  a connected device (§4, §11).
- Clone any demo or stock map into an editable copy (§5).
- Keep your patterns and maps saved locally in the browser — no account, no
  cloud (§10).

### What it doesn't do

- **Pattern management on the device.** It won't list, rename, or delete the
  device's saved patterns, or drive playlists — that belongs to the device's own
  UI. Send pushes one pattern at a time (run or save), nothing more (§11).
- **Read patterns back from a controller.** The import path is `.epe` files, not
  a device connection.
- **Device setup.** LED hardware type, WiFi, expanders, and the rest of the
  device's settings stay on the device's settings page. (The live panel's
  editable pixel count is the one exception, §11.)
- **Sensor input in the preview.** Sensor-reactive patterns load and run, but
  sound, accelerometer, and light inputs are inert stubs off-device (§12).
- **Multi-controller sync.** Several Controllers can be connected at once, but
  each independently — synchronised playback across devices is Firestorm
  territory (Ecosystem Primer).

## 2. Screen at a glance

- **Header** — the PXLBLZ wordmark and the **Libraries** menu on the left
  (authoring reference); the **Controller** connection surface on the right
  (hardware).
- **Left rail** — your patterns and maps, plus the shipped demos and stock maps,
  with a dimension filter and name search (§10).
- **Editor pane** (centre) — Monaco, in pattern mode or map mode (§9).
- **Preview pane** (right) — the animated canvas, a play/pause transport row, and
  the **control deck** below it: device-like settings, preview-only viewing
  controls, your pattern's own controls, and a variable watcher (§8).

## 3. Preview

The preview is not a rough approximation; it is built to match what your hardware
will do, across all three dimensionalities.

**It renders 1D, 2D, and 3D.** The IDE reads your render functions and infers the
pattern's dimensionality (a `render()` pattern is 1D, `render2D` 2D, `render3D`
3D), then draws it on a configurable arrangement of glowing dots. For 3D — and for
1D/2D patterns wrapped onto a 3D form — you get an **orbit viewport**: it
auto-spins, you can drag to orbit freely (horizontal drags yaw, vertical drags
tilt, horizon held level), and grabbing it just holds the spin until you let go.
Nearer dots draw larger and brighter and occlude the ones behind, so a sphere reads
as a sphere.

**Hardware-faithful math.** Pixelblaze runs 16.16 fixed-point, not floats — and
that gap is exactly where ported GPU shaders break. The **renderer** toggle picks:

- **Fast** (default) — plain float64. Smooth, right for everyday editing.
- **Precise** — emulates the controller's 16.16 arithmetic: overflow, precision
  loss, bitwise semantics, validated against a real device. Flip to Precise when
  you need to trust that what you see is what the device will do.

Two honest caveats: `perlin` and the random functions are different algorithms
from firmware, so they diverge slightly even in Precise mode (pure integer math is
bit-identical), and Precise is slower — which is why Fast is the default.

**Viewing controls.** Three preview-only sliders shape how the dots look — none
touch your pattern's math or ever reach hardware: **light size** (how big each
source draws), **diffusion** (blurs sources together like a diffuser sheet), and
**solidity** (for closed shapes, fades the back-facing dots so a solid object
hides its own back). Exact semantics and what sticks where: §8.

## 4. Maps and embeddings — what's read vs. how it's drawn

Just like real hardware, a **pixel map** describes where each LED sits, decoupled
from chain order. The IDE splits "layout" into two deliberately separate controls:

- The **Map** control picks the geometry your pattern *reads* — the coordinates
  fed to `render2D`/`render3D`. It lives inside the **PIXELBLAZE block** of the
  deck, with the other settings a real device would carry.
- The **embedding** control picks how the dots are *drawn* — a viewport choice the
  device never sees. It sits on the **transport row** beside play/pause.

Which controls appear depends on the pattern's dimensionality; a control that
offers no real choice is hidden, not disabled:

| Pattern | Map control | Embedding control |
|---|---|---|
| 1D | — (no map at all) | shape: **line**, **ring**, or **pole** (a helix with adjustable wrap density) |
| 2D | ✓ | surface: **Flat** or **Cylinder** (proportions follow the map's aspect) |
| 3D | ✓ | — (the map owns the geometry) |

**Stock maps** ship ready to use: Square, Wide 2:1, Ring, and a 3D set in
shell/volume pairs — Cube, Sphere, Star, and Tetra (a d4), where "shell" puts LEDs
on the surface and "volume" fills the interior. Every stock map is real, pasteable
Mapper code: open one read-only under Stock Maps and **Clone** it into an editable
copy.

**Custom maps**: click **New Map** and you get an editor on a plain
`function(pixelCount)` — exactly what a real Pixelblaze Mapper tab evaluates, full
JavaScript with `Math.*`, authored in whatever units fit your build. Custom maps
re-bake automatically as you edit (the same once-at-save evaluation hardware does)
but never change the running preview on their own; you assign a map to a pattern
with the preview's Map control.

## 5. Patterns, demos, and libraries

The left rail holds **Your patterns** (stored in this browser, no account or
cloud), **Demos** (read-only, runnable examples — shader ports, eased sweeps,
noise fields, test patterns), and in Maps mode **Your maps** and **Stock maps**. A
new pattern starts from a runnable animated starter; any demo or stock map can be
**cloned** into an editable copy. Demos can open with a recommended map, pixel
count, and solidity — defaults only, everything stays switchable (§8).

The bundled **libraries** live in the header's Libraries menu — click one to view
its source read-only, hover for its API reference:

| Library | What it provides |
|---|---|
| `SDF` | 2D signed distance fields — circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim` | easing curves, oscillators, phase timing, looping primitives |
| `Color` | HSV/RGB blends, palette interpolation, colour math |
| `Coord` | polar coordinates, rect↔polar conversion, transforms |
| `Noise` | value noise, organic variation (hashes made hardware-safe) |
| `Shader` | GLSL gap-fillers (`fract`, `step`, `dot`, palettes, integer hashes) for shader ports |

The `Shader` library plus the Precise renderer make the IDE a comfortable home for
porting ShaderToy-style GLSL: the library fills the genuine GLSL gaps with
hardware-safe equivalents (notably integer hashes that don't overflow on the
device). Porting is human-driven — some idioms translate cleanly, some need
rewriting, and GPU-only features (textures, multipass feedback, `dFdx`) won't port.

## 6. Working with a real Controller

When a Pixelblaze is on your LAN, the IDE talks to it live through a small Chrome
helper extension (a deployed web page can't open a `ws://` LAN connection itself —
Ecosystem Primer §11). Install it once; the in-app Connect surface walks you
through it. Then:

- **Find your Controller** from the connect dropdown (top right): pick it from the
  auto-discovered list, or type its IP.
- **Grant access once per device** — Chrome's native "Allow access to `<ip>`?"
  prompt, remembered thereafter.
- **Mirror and drive it live**: a panel shows the active pattern, brightness,
  pixel count, installed map size, and FPS, with the running pattern's controls
  draggable in real time.
- **Send to Controller** compiles the open pattern with the device's own compiler
  and pushes it — transiently (**Run**) or into the device's Saved Patterns
  (**Save**).
- **Send map to Controller** writes the open map to the device's single shared map
  slot, confirm-first.

Connecting is strictly additive — the offline workflow doesn't change, and nothing
the preview invents (light size, diffusion, solidity, Fast/Precise) is ever sent
to the device. Full reference: §11.

## 7. On and off hardware by hand

No device, no extension, or just by preference:

- **Copy Code / Download** emits a single flat `.js` — every library function you
  used inlined, `export`s preserved — exactly the format the device expects. Paste
  it into the built-in Pixelblaze editor or upload the file. Disabled while your
  code has a compile error.
- **Import** opens `.epe` files exported from the Pixelblaze hardware editor; they
  land as new editable patterns.

---

# Part 2 — Reference

## 8. Control deck, control by control

Controls group by what they *are*, and the IDE keeps that boundary visible.

### PIXELBLAZE block — settings real hardware would carry

These would round-trip to a controller:

- **Map** — the geometry the pattern reads (§4). A stacked full-width field
  (map names are long). Absent entirely for 1D patterns.
- **Pixels** — the LED count, a single number; the map arranges it (the Square
  map squares it up).
- **Fit** — the Fill/Contain choice, mirroring the Pixelblaze Mapper's own
  dropdown; both are real device behaviours, chosen per pattern. **Contain**
  (default) preserves the map's true aspect — a circle stays a circle; **Fill**
  stretches each axis to the unit square. Absent for 1D.
- **Brightness** — a **logarithmic** slider: more of the track is devoted to the
  dim end, where small changes matter most, while reading and writing plain
  `0..1`.

### Preview block — things the device never sees

Telemetry first: **fps**, **elapsed** time, and the active layout's dimensions.
Then:

- **Renderer** — Fast / Precise (§3).
- **Speed** — 0.1×–2× playback via a virtual clock; the pattern's own sense of
  time scales with it.
- **Light size** — how big each light source draws, as a fraction of the spacing
  between dots. Grows dots in place; never moves them.
- **Diffusion** — blurs sources together like a physical diffuser sheet. At 0
  they're crisp; turned up, they merge into a smooth, gap-free field. Never
  changes a source's size, never dims the image.
- **Solidity** — only for shapes with a front and a back (sphere shell, cube
  shell, cylinder, pole). Fades back-facing dots, from transparent (LEDs on glass
  or mesh) to fully solid.

A **rewind icon** beside the Preview title appears whenever any setting differs
from its default, and resets the whole preview in one click (semantics below).

### What sticks where

- **Per pattern**: map, pixels, fit, solidity, speed, brightness — adjust them on
  a pattern (or a demo) and they're remembered for it and restored next open.
- **Comfort baselines**: light size and diffusion are global — dial them in once
  and they're your default everywhere. Adjusting one *on a particular pattern*
  sticks to just that pattern, on top of your baseline.
- **Demos** may carry recommended settings (map, pixel count, solidity — the
  sphere demos open as dense solid spheres). They're defaults only; your tweaks
  outrank them and are remembered per demo. **Forking** a demo snapshots how it
  looks right now into your copy, with no live link back.
- **Reset (the rewind icon)**: a user pattern drops back to app defaults; a demo
  reverts to its author's recommended look. Your light-size/diffusion comfort
  baseline is never touched by a reset — it's a preference, not part of the
  pattern.
- **Renderer (Fast/Precise) is the one pure-global setting** — a machine choice,
  never per-pattern.

### Pattern controls and the var watcher

- **Pattern controls** — export a `sliderX`, `toggleX`, `hsvPickerX`, or
  `rgbPickerX` function and the IDE renders the matching widget, feeding your
  function values live — the same controls the hardware shows. `showNumber`,
  `gauge`, `trigger`, and `inputNumber` are recognised but don't render a widget
  yet; the pattern still loads and runs.
- **Watch variables** — the var watcher shows the live value of every
  `export var`, refreshed each frame, arrays element by element — just like the
  on-device Var Watcher.

## 9. Editor in detail

Monaco in a Pixelblaze language mode:

- **Autocomplete and signature hints** for the full built-in surface and every
  bundled library function, with **hover cards** on library functions.
- **Live error checking** — syntax errors plus the Pixelblaze-specific violations
  (`let`, `const`, `class`, `new`, `switch`, `try`/`throw`, `import`) as inline
  markers, with a Good/Broken status badge. Broken code keeps the last good
  version running in the preview rather than blanking it.
- **Quiet auto-save** to the browser's storage, with clean changes pushed to the
  preview as you pause typing.

The editor doubles as the **map editor** in map mode — a plain-JavaScript surface
with its own parse-checking badge. Custom maps are editable and deletable (delete
is confirmation-guarded); stock maps open read-only with **Clone**.

## 10. Rail in detail

A primary **Patterns / Maps** switch, then a filter row combining two things:

- **Dimension lens** — single-select All / 1D / 2D / 3D; shows only items of that
  native dimension (a pattern's dimension is the highest render function it
  defines). Maps have no 1D form, so the 1D pill is hidden in Maps mode; entering
  Maps with the lens on 1D silently switches it to 2D. Empty demo subsections hide
  rather than leaving bare headers. The lens is ephemeral (resets on reload), and
  the active document stays loaded even when filtered out of view.
- **Name search** — the magnifier expands into a type-down filter that
  AND-combines with the lens. An active query force-expands collapsed groups to
  surface hits, restoring their collapse state when cleared. Search text is kept
  separately for Patterns and Maps; the lens is shared.

The switch and filter row stay fixed; only the lists scroll. Your patterns and
maps are created, renamed, and deleted by you, stored in the browser (IndexedDB) —
persistent across sessions, no account. Delete lives in the editor header as a
visible, confirmation-guarded action, with the rail hover action as a shortcut.

## 11. Controller reference

### Connecting

The helper is a Chrome extension that relays the `ws://` connection a deployed
page can't open itself. With it installed, a **Connect** affordance appears top
right; its dropdown offers two ways in:

- **Discover** — lists Pixelblazes found via ElectroMage's cloud finder (the same
  service the official tools use; your device needs to have reached the internet
  at least once). The list runs automatically when the dropdown opens and
  refreshes periodically; a rescan button (spins while working) forces a fresh
  look. Click a device to connect.
- **By IP** — type the LAN address and connect. Always works, even when cloud
  discovery can't see the device.

The first connection to a given device surfaces Chrome's native **"Allow access
to `<ip>`?"** prompt — approve once and it's remembered (several discovered
devices can batch into one prompt). This per-device grant is what lets the
extension be least-privilege rather than holding blanket network access.

### Status vocabulary

The status dot: **dark grey** = extension not installed; **grey** = installed,
nothing connected; **amber, blinking** = connecting; **green** = connected;
**red** = error. Each connected Controller gets its own **pill** showing its
name — remembered across reloads, so it reads "burner-bag" rather than a bare IP
even mid-connect. Connections **reconnect on their own** if the device blips off
and back. Click a pill to make that Controller active and open its panel; more
than one can stay connected.

### Live panel

A pinned popover under the active pill, polled live, in rows:

- **Active pattern** name and a **brightness** slider (logarithmic, like the
  preview's). Brightness and control writes are volatile — never written to
  flash, to spare it.
- **Map points** and **pixel count**. The map-points figure flags **amber** when
  it disagrees with the pixel count — a mismatched map is silently ignored by the
  firmware, so this makes that footgun visible. The **pixel count is editable**;
  committing a new value saves it to the device (the only way to make a
  fixed-size map apply). The input holds your entered value, dimmed, while the
  slow write is in flight.
- **IP** and reported **frame rate**.
- The running pattern's **live controls**, draggable in real time. A control
  whose device value can't be read as a real `0..1` position — run-only patterns
  report none; saved patterns report mutated variable values, not slider
  positions — shows an **indeterminate** hollow-ring state with a `—` readout,
  still draggable so you can set it.

Closing and reopening the same device's panel shows last-known values immediately;
switching devices clears first.

### Send to Controller (patterns)

Send compiles the open pattern with the **device's own compiler** and pushes the
result. A small **Run / Save** pill beside the button picks the mode; the Send
button's glyph and tooltip follow it:

- **Run** (default) — load and run transiently. Plays immediately, but is **not**
  added to the device's Saved Patterns; its name lives only in the IDE.
- **Save** — persist into Saved Patterns *and* activate it. Save **overwrites in
  place**: repeated Saves update the same on-device program instead of piling up
  copies.

Run and save are tracked independently — a clean run push doesn't satisfy a
pending save; flipping the toggle re-arms Send. Send is enabled when a Controller
is connected and the pattern compiles cleanly; if the IDE can tell the pattern's
dimensionality won't match the device's installed map, it says so. **Demos can be
sent directly**, no fork needed. There's no pixel-count warning on pattern push: a
pattern push sends bytecode only and keeps the device's existing map, so a count
mismatch is "this won't look right," not an error.

### Send map to Controller

Writes the open custom or stock map to the device's **single shared map slot** — a
deliberate, confirm-first action, since one map is shared by every pattern on the
device. The IDE re-bakes the map to the device's exact pixel count first, because
the firmware drops any map whose point count doesn't match (Ecosystem Primer §10).

## 12. Good to know

- **Patterns run on your browser's main thread.** A genuinely infinite loop can
  freeze the tab — there's no watchdog like real hardware has. The IDE only runs
  code that compiles cleanly, which reduces but doesn't eliminate the risk.
- **`perlin` and the random functions diverge slightly** from firmware even in
  Precise mode — different algorithms, not reverse-engineered. Pure integer math
  is bit-identical on both sides.
- **Sensor-reactive patterns load and run**, but the sensor inputs (sound FFT,
  accelerometer, light) are inert stubs, so they won't animate from audio or
  motion in the preview.
- **Everything is per-browser.** Patterns and settings live in this browser's
  storage; there's no account and no sync between machines.

---

For the platform itself — fixed-point, maps, the WebSocket wall — see the
**Pixelblaze Ecosystem Primer**. For making patterns fast, **Optimizing
Pixelblaze patterns**. For how PXLBLZ is built, the **PXLBLZ Technical
Reference**.
