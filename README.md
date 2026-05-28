# Pixelblaze IDE v2

A browser-based pattern editor for [Pixelblaze](https://electromage.com/) LED controllers — built as an alternative to the editor built into the hardware.

**[Open the IDE →](https://jon-whiteroomsoftware.github.io/pixelblaze-v2/)**

---

## Why a separate editor?

The built-in Pixelblaze editor works, but it has three rough edges this IDE smooths out:

- **No hardware needed.** Write and preview patterns entirely offline. The IDE runs in your browser with no controller connected
- **A modern code editor** with autocomplete and inline errors
- **Reusable libraries.** Build your own patterns leveraging existing library code

---

### Available libraries

Hover over any library name in the left pane to see a quick summary of its functions. Click to open the full source in the editor.

| Library | What it provides                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------- |
| `SDF`   | 2D signed distance fields: circles, rects, rings, stars, polygons, smooth boolean ops, glow fills |
| `Anim`  | Easing curves, oscillators, phase timing, looping animation primitives                            |
| `Color` | HSV/RGB blend modes, palette interpolation, colour math                                           |
| `Coord` | Polar coordinates, rectangular↔polar conversion, spatial transforms                               |
| `Noise` | Value noise, Voronoi distance, organic variation                                                  |

---

## Demo patterns

The **Demos** section in the left pane has several patterns that show what the libraries can do — animated SDFs, eased sweeps, Perlin flow fields, a Kishimisu shader port, and others. They're read-only in the editor but you can copy a demo's code into a new pattern if you want to modify it.

---

## Pattern controls

If your pattern exports `sliderX`, `toggleX`, `hsvPickerX`, or `rgbPickerX` functions, the IDE renders interactive controls in the preview pane — sliders, toggles, and colour pickers. These match the controls the hardware uses. You can adjust them live while the pattern runs, without editing code.

The **Var Watcher** below the controls shows the current values of every `export var` in your pattern, refreshed each frame — handy for checking that your variables are doing what you expect.

---

## Exporting to hardware

The IDE doesn't upload to hardware directly yet. Instead:

- **Copy Code** (button in the editor header) — copies the transpiled, library-inlined artifact to your clipboard. Paste it directly into the built-in Pixelblaze editor.
- The copy button is disabled when your pattern has a compile error.

The copied code is a flat `.js` file with all library functions inlined and `export` keywords preserved — exactly the format the hardware expects.

---

## Importing patterns

**Open** (button in the left pane header) imports `.epe` files exported from the Pixelblaze hardware editor. The pattern is added to your library and opened immediately.

---

## Limitations to know about

A few things that aren't there yet:

- **Hardware upload** — connecting directly to a controller over the local network is planned but not built. Use Copy Code for now.
- **1D strip patterns** — `render(index)` without a 2D map isn't supported in the preview yet. The pattern will save and copy correctly, but you won't see output in the grid.
- **Coordinate transforms** — `translate`, `scale`, `rotate`, and friends are recognised syntax but are no-ops in the preview. Patterns that animate by transforming the coordinate space will appear static here.
- **Float64 vs. hardware arithmetic** — the preview runs your code as native JavaScript float64. The hardware uses a fixed-point format. Patterns that use bitwise tricks or rely on integer overflow may look different in the preview than on the device.
