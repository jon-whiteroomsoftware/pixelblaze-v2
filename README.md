# PXLBLZ-IDE

PXLBLZ-IDE is a browser-based pattern editor for
[Pixelblaze](https://electromage.com/) LED controllers. It lets you write,
preview, tune, and export Pixelblaze patterns without needing a controller on
your desk, then push the result to hardware when you are ready.

The IDE can be run from the link below and is fully functional. If you later
want to connect to a controller, install the companion Chrome extension.

**[Open PXLBLZ-IDE](https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/)**

## Why it exists

I started this project to address some wishlist features I had for Pixelblaze:

1. Develop and debug patterns without a controller
2. Store patterns and maps off-device
3. Reusable code libraries
4. Benchmarking and optimization tools

The IDE provides these four features, and a few others:

- A rich editor with autocomplete, hover help, background compile errors, and
  quiet auto-save.
- A live 1D / 2D / 3D preview that can show patterns rendered as lines, rings,
  poles, flat 2D maps, cylinders, shells, and volumes.
- A software renderer with hardware-accurate 16.16 fixed-point math.
- First-class maps (named, saveable), including stock 2D and 3D maps plus your
  own.
- Bundled libraries for SDFs, animation, color, coordinates, noise, and
  ShaderToy-style porting helpers.
- Copy / download of a flat, tree-shaken `.js` controller-ready artifact, or push
  it straight to your controller.
- Benchmarking scripts that automate perf testing under emulation and on device.

## What else works today

- Connect to a Pixelblaze over the local network through the companion Chrome
  extension. Run or save patterns and maps to a controller.
- Uses ElectroMage's discovery service to find controllers on your local network.
- Edit user patterns in the browser and preview them in the IDE or on a controller.
- Import `.epe` files exported from Pixelblaze.
- Clone shipped demos and stock maps into editable copies.
- Tune preview-only display controls such as light size, diffusion, solidity,
  playback speed, and Fast / Precise rendering.
- Use pattern controls and watch exported variables in the preview.

## What it does not do

- It does not manage saved patterns, playlists, WiFi, LED hardware settings, or
  other device administration. Use the Pixelblaze web UI for that.
- It does not read patterns back from a controller. Import `.epe` files instead.

## Acknowledgement

Thanks to [Ben Hencke](https://electromage.com/about) and ElectroMage for
building Pixelblaze. It has been a small box with an outsized effect: a lot of
fun, and a generous way into making electronics feel approachable.

## Bundled libraries

Open the **Code** menu in the app header for source and hover summaries.

| Library  | What it provides                                                                      |
| -------- | ------------------------------------------------------------------------------------- |
| `SDF`    | 2D signed distance fields: circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim`   | Easing curves, oscillators, phase timing, looping primitives                          |
| `Color`  | HSV/RGB blends, palette interpolation, color math                                     |
| `Coord`  | Polar coordinates, rect-to-polar conversion, transforms                               |
| `Noise`  | Value noise, Voronoi distance, organic variation                                      |
| `Shader` | GLSL gap-fillers such as `fract`, `step`, `dot`, palettes, and hardware-safe hashes   |

## Good to know

- If the app does not reconnect to a Pixelblaze Controller when it opens, reload
  the browser window first. If it still does not pick up, manually disconnect and
  reconnect from the Controller menu.
- Patterns, maps, and demo setting overrides are stored in this browser's
  IndexedDB. Clearing site data clears that local workspace.
- Preview brightness is for the screen. Controller brightness is controlled from
  the connected Controller panel and is not copied from the preview.
- Precise rendering emulates Pixelblaze's fixed-point arithmetic, but `perlin`
  and random functions still diverge slightly because the browser shim does not
  reverse-engineer those firmware algorithms.
- Everything preview-only stays preview-only: light size, diffusion, solidity,
  Fast / Precise, playback speed, and viewport choices are never sent to
  hardware.

## Local development

```bash
npm install
npm run dev
```

The normal development server runs at `http://localhost:5174/`.

Useful checks:

```bash
npm test
npx tsc --noEmit
npm run build
```

## Documentation

- **[PXLBLZ Feature Guide](docs/reference/PXLBLZ%20Feature%20Guide.md)** - start
  here if you use Pixelblaze and want to know what the IDE does.
- **[Pixelblaze Ecosystem Primer](docs/reference/Pixelblaze%20Ecosystem%20Primer.md)** -
  background on the Pixelblaze model this project assumes.
- **[PXLBLZ Technical Reference](docs/reference/PXLBLZ%20Technical%20Reference.md)** -
  how the IDE is built: preview engine, maps, settings cascade, controller
  connection, storage, and the transpiler.

## Status

PXLBLZ-IDE is small, local-first, and still evolving. Expect rough edges, keep
copies of patterns you care about, and file issues with enough detail to
reproduce the problem.

## Where from here

This feels useful and feature-complete enough to call a 1.0, but it probably has
some bugs left to shake out. If you try it and something breaks, please open a
GitHub issue with enough detail to reproduce it.

More features are welcome if there is real interest, and pull requests are also
welcome. Small, focused changes with a clear use case are easiest to review.
