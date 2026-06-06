# PXLBLZ

![PXLBLZ](docs/screenshots/promo-marquee.jpg)

![Edit patterns in a real code editor](docs/screenshots/promo-edit.jpg)

![Hardware-faithful live preview](docs/screenshots/promo-preview.jpg)

![Reusable libraries and demos](docs/screenshots/promo-editor.jpg)

![Connect to a controller on your network](docs/screenshots/promo-connect.jpg)

## What is PXLBLZ?

A development environment for [Pixelblaze](https://electromage.com/) LED controllers.

## Why does it exist? There's already an ElectroMage IDE.

Pixelblaze ecosystem + modern IDE creature comforts = ❤️

- A home for patterns and maps beyond the controller
- Reusable library code without a large runtime cost
- Maps that are first-class objects: named and portable between controllers
- Driving aids like autocomplete, error detection, and inline API docs
- Libraries, examples, and guidelines for porting OpenGL shaders
- An interactive and accurate pattern/map preview mode

Don't worry, it also does these things:

- Connect to a controller (via Chrome extension) to run and save patterns, change controller settings, or watch variables
- View and adjust pattern controls for the preview or the controller
- Preview in Precise mode uses 16.16 fixed-point math (not floats) to reproduce controller patterns more accurately

<a href="https://jon-whiteroomsoftware.github.io/PXLBLZ-IDE/"><img src="docs/screenshots/launch-ide-button.png" alt="Launch PXLBLZ IDE now" width="360"></a>

---

## Bundled libraries

Open the **Libraries** menu in the header for a summary on hover; click any to open its source.

| Library  | What it provides                                                                       |
| -------- | -------------------------------------------------------------------------------------- |
| `SDF`    | 2D signed distance fields — circles, rects, rings, stars, polygons, smooth boolean ops |
| `Anim`   | Easing curves, oscillators, phase timing, looping animation primitives                 |
| `Color`  | HSV/RGB blends, palette interpolation, colour math                                     |
| `Coord`  | Polar coordinates, rectangular↔polar conversion, spatial transforms                    |
| `Noise`  | Value noise, Voronoi distance, organic variation                                       |
| `Shader` | GLSL gap-fillers (`fract`, `step`, `dot`, `reflect`, palettes) for shader ports        |

## Good to know

- **Patterns and maps are stored in your browser's IndexedDB**. You can't access them from a different computer or browser, and if you clear your IndexedDB, you will lose them.
- **`perlin` and the random functions diverge slightly** from firmware even in Precise mode; they're different algorithms, not reverse-engineered.
- **Sound- and sensor-reactive patterns** load and run, but the sensor inputs are inert stubs, so they won't animate from audio here.

## What to read next

- **[PXLBLZ Feature Guide](docs/PXLBLZ%20Feature%20Guide.md)** — _for someone who uses Pixelblaze._ What every control on the screen does: the preview, maps, the control deck, live controls, and getting code onto hardware. Start here if you just want to use the IDE.
- **[PXLBLZ Technical Reference](docs/PXLBLZ%20Technical%20Reference.md)** — _for someone building the IDE._ The authoritative as-built description of how it works: transpiler, validator, fixed-point engine, maps and embeddings, camera, render loop, storage. Start here to contribute.
- **[Pixelblaze Ecosystem Primer](docs/Pixelblaze%20Ecosystem%20Primer.md)** — _for someone new to Pixelblaze itself._ The mental model the other two assume: device vs. browser, 16.16 fixed-point, the pattern and mapper dialects, the WebSocket API. Start here if "fixed-point" or "pixel map" needs unpacking.
