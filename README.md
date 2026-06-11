# PXLBLZ-IDE

PXLBLZ-IDE is a browser-based pattern editor for
[Pixelblaze](https://electromage.com/) LED controllers. It lets you write,
preview, tune, and export Pixelblaze patterns without needing a controller on
your desk, then push the result to hardware when you are ready.

**[Open PXLBLZ-IDE](https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/)**

## Why it exists

The built-in Pixelblaze editor is still the right place for device setup and
day-to-day controller management. PXLBLZ-IDE is for the parts of pattern work
that benefit from a bigger browser workspace:

- A Monaco editor with autocomplete, hover help, background compile errors, and
  quiet auto-save.
- A live 1D / 2D / 3D preview that can run with Pixelblaze-style 16.16
  fixed-point math when fidelity matters.
- Patterns and maps stored in your browser instead of on one controller.
- First-class maps, including stock 2D and 3D maps and savable custom maps.
- Bundled libraries for SDFs, animation, color, coordinates, noise, and
  ShaderToy-style porting helpers.
- Read-only demos that can be cloned into editable patterns.
- Copy / download of a flat, tree-shaken `.js` artifact that is ready for the
  hardware editor.

It is a hobby-engineering workbench, not a replacement for ElectroMage's own
software.

## What works today

- Edit user patterns in the browser and preview them live.
- Import `.epe` files exported from Pixelblaze.
- Clone shipped demos into editable local patterns.
- Create, edit, clone, and preview map source.
- Preview patterns on lines, rings, poles, flat 2D maps, cylinders, shells, and
  volumes.
- Tune preview-only display controls such as light size, diffusion, solidity,
  playback speed, and Fast / Precise rendering.
- Use pattern controls and watch exported variables in the preview.
- Connect to a Pixelblaze over the local network through the companion Chrome
  extension.
- Run or save the open pattern on a connected controller.
- Push stock or custom maps to a connected controller.

## What it deliberately does not do

- It does not manage saved patterns, playlists, WiFi, LED hardware settings, or
  other device administration. Use the Pixelblaze web UI for that.
- It does not read patterns back from a controller. Import `.epe` files instead.

## Bundled libraries

Open the **Code** menu in the app header for source and hover summaries.

| Library | What it provides |
|---|---|
| `SDF` | 2D signed distance fields: circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim` | Easing curves, oscillators, phase timing, looping primitives |
| `Color` | HSV/RGB blends, palette interpolation, color math |
| `Coord` | Polar coordinates, rect-to-polar conversion, transforms |
| `Noise` | Value noise, Voronoi distance, organic variation |
| `Shader` | GLSL gap-fillers such as `fract`, `step`, `dot`, palettes, and hardware-safe hashes |

## Good to know

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
