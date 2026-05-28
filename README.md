# Pixelblaze IDE v2

A browser-based pattern editor for [Pixelblaze](https://electromage.com/) LED controllers — built as an alternative to the editor built into the hardware.

**[Open the IDE →](https://jon-whiteroomsoftware.github.io/pixelblaze-v2/)**

---

## Why a separate editor?

The built-in Pixelblaze editor works, but it has three rough edges this IDE smooths out:

- **No hardware needed.** Write and preview patterns entirely offline. The IDE runs in your browser with no controller connected.
- **A real code editor.** Monaco (the editor inside VS Code) with syntax highlighting, inline error squiggles, autocomplete for every built-in function, and signature hints when you type `(` after a function name.
- **Reusable libraries.** Five bundled libraries — `SDF`, `Anim`, `Color`, `Coord`, `Noise` — let you call well-tested functions with `LibName.fnName()` syntax. The transpiler inlines only the functions you actually use before bundling for the hardware.

---

## Layout

```
┌──────────────┬────────────────────────┬──────────────────────┐
│  Patterns    │                        │  LED Preview         │
│              │   Code Editor          │  ──────────────────  │
│  Libraries   │   (Monaco)             │  Pattern Controls    │
│  Demos       │                        │  Var Watcher         │
│  Your work   │                        │                      │
└──────────────┴────────────────────────┴──────────────────────┘
```

Drag the vertical dividers to resize panes.

---

## Writing patterns

Patterns are written exactly as they are for the hardware — `export function beforeRender(delta)`, `export function render2D(index, x, y)`, `hsv()`, `rgb()`, built-ins, all of it. The IDE runs your code in the browser so the preview is live.

**One thing to know about the sync tick:** the IDE doesn't push every keystroke to the preview. Instead a background tick fires every few seconds. If your code compiles cleanly at that moment, it auto-saves and reloads the preview. While you're editing, the last clean version keeps running. The compile status badge at the top of the editor pane shows **Good** or **Broken** in real time — you can always tell whether your current code would sync.

**New patterns** start with a simple hue-gradient skeleton that immediately produces visible output, so you can tell the pipeline is working before you've written anything.

---

## Using libraries

Libraries are groups of functions you can call from any pattern. Reference them with dot notation:

```js
export function render2D(index, x, y) {
  var d = SDF.circle(x, y, 0.5, 0.5, 0.3)
  var brightness = SDF.fillGlow(d, 0.05)
  hsv(Anim.easeInOut2(time(0.1)), 1, brightness)
}
```

The transpiler resolves `SDF.circle`, `SDF.fillGlow`, and `Anim.easeInOut2`, inlines only those functions into the artifact, and rewrites the calls — the output file is self-contained and ready for the hardware.

### Available libraries

| Library | What it provides |
|---------|-----------------|
| `SDF` | 2D signed distance fields: circles, rects, rings, stars, polygons, smooth boolean ops, glow fills |
| `Anim` | Easing curves, oscillators, phase timing, looping animation primitives |
| `Color` | HSV/RGB blend modes, palette interpolation, colour math |
| `Coord` | Polar coordinates, rectangular↔polar conversion, spatial transforms |
| `Noise` | Value noise, Voronoi distance, organic variation |

Hover over any library name in the left pane to see a quick summary of its functions. Click to open the full source in the editor.

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

---

## Running locally

```bash
npm install
npm run dev       # dev server at http://localhost:5174
npm test          # run the test suite
npm run build     # production build → dist/
```

Requires Node 18+.
