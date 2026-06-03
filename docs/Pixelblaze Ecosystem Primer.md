# The Pixelblaze Ecosystem — A Primer

This document is a medium-detail mental model of **Pixelblaze itself** — the
hardware, the firmware, the language, and the workflow ElectroMage built. It is
*not* about PXLBLZ; for that, read the **PXLBLZ Feature Guide** (what PXLBLZ does)
or the **PXLBLZ Technical Reference** (how it's built). The point of this primer is to
give you the model you need *before* either of those makes full sense: what the
device knows, what the browser knows, why patterns and maps use two subtly
different dialects of JavaScript, and how a pattern actually gets onto a strip of
LEDs.

It is distilled from ElectroMage's own documentation (the language reference, the
mapper docs, the WebSocket API, the hardware guides) plus the behaviour this
project has verified against a real controller. Where ElectroMage's docs and our
hardware testing agree, this is gospel; where this project has *characterised*
behaviour the official docs leave implicit (overflow, truncation, Fill/Contain),
that is called out.

---

## 1. What a Pixelblaze is

A **Pixelblaze** is a small WiFi microcontroller (ESP-based) sold by
[ElectroMage](https://electromage.com/) that drives addressable LED hardware —
strips, matrices, rings, and 3D sculptures. You write a small program — a
**pattern** — and the controller runs it in a tight loop, computing a colour for
every LED, many times per second.

The defining traits of the platform:

- **It is self-contained.** The controller stores your patterns in flash, runs them
  standalone (no computer attached), and serves its own editor web app from its own
  IP address. You point a browser at the device and edit live.
- **It is networked, not tethered.** You talk to it over WiFi via a WebSocket API on
  port 81. There is no USB data protocol for editing — USB is only power. (See §7.)
- **It is fixed-point.** Every number in a pattern is a 16.16 fixed-point value, not
  a float. This single fact explains a large fraction of the platform's quirks (§3).
- **Supported LEDs**: APA102/SK9822 ("DotStar", 4-wire clock+data, HDR — recommended),
  WS2812/WS2811/WS2813/WS2815/SK6812 ("NeoPixel", 3-wire data-only), and WS2801.
  RGBW variants are supported. Power budgeting is roughly 20 mA per colour channel
  per pixel (60 mA for full white).

There are several hardware variants (V2, V3 Standard, V3 Pico, plus an Output
Expander for many parallel channels and a Sensor Expansion board for sound/motion/
light). The differences mostly matter for wiring and a few V2-vs-V3-only built-ins;
the language and workflow are common across them.

---

## 2. The two halves of the mental model: device vs. browser

The single most important thing to internalise is **which half of the system owns
what**. Pixelblaze splits cleanly into a *device* side and a *browser* side, and
many of the platform's design choices only make sense once you see that line.

| Concern | Lives on the **device** (firmware) | Lives in the **browser** (authoring) |
|---|---|---|
| Pattern *source* | stored in flash | edited here |
| Pattern *execution* | the firmware's fixed-point engine runs it per frame | — |
| Pattern *compilation* | the device compiles source → bytecode on upload | — |
| The **pixel map** | stored as a coordinate *array* (positions only) | the **map function** runs *here* to produce that array |
| `pixelCount` | a device setting | — |
| Controls (sliders, etc.) | values persisted on device | rendered as widgets |

Two consequences fall straight out of this table and recur everywhere:

1. **The device stores map *data*, not the map *function*.** When you write a mapper
   function, *your browser* evaluates it and uploads only the resulting list of
   coordinates. The function never runs on the Pixelblaze. (This is why the mapper
   is plain JavaScript — see §5.)
2. **The pattern is the only thing the firmware actually *runs*.** And it runs it in
   fixed-point, after compiling it to bytecode. This is why the pattern dialect is
   constrained and why "it worked in a browser preview" is not the same as "it works
   on hardware" (§3, §6).

---

## 3. The number system: 16.16 fixed-point

Every value a pattern computes is a **16.16 fixed-point** number: a signed 32-bit
integer interpreted as `value × 65536`. That gives:

- **Range** roughly **−32768 to +32768**.
- **Precision** of **1/65536** (about 0.0000153) — the smallest representable step.
- **Overflow that wraps**, not saturates: exceeding the range rolls over (int32
  wrap), confirmed against a real device (fw 3.67).

This is *not* an implementation detail you can ignore. It shapes how patterns are
written:

- Patterns are written to **work in the 0–1 range** wherever possible (hue,
  saturation, brightness, coordinates, waveform phases are all 0..1). Staying near
  0–1 keeps you far from overflow and gives you the most fractional precision.
- **Large intermediate values overflow silently.** The classic trap is the GLSL
  shader hash idiom `fract(sin(p · 12.9898) · 43758.5453)`: the `· 43758` blows
  past 32768 and wraps. On a float machine it looks perfect; on a Pixelblaze it
  turns to noise or zero. Porting GPU shaders means rewriting anything that relies
  on big numbers.
- **Bitwise operators act on all 32 bits** (16 integer + 16 fraction), which is
  *different* from JavaScript, where bitwise coerces to a 32-bit *integer* first.
  The one exception ElectroMage documents is `~`, which zeros the low 16 bits (so
  `~x` operates on the integer part). This project verified that the device's
  bitwise ops effectively integer-coerce operands (`~2.5 → -3`).
- **Multiply, `frac`, and `%` truncate** toward the sign of the dividend; **divide
  also truncates** on the device. (Useful when reasoning about exact results;
  power-of-two divides are exact.)

The takeaway for a pattern author: *integer-only arithmetic is the only thing that
is bit-exact and overflow-predictable.* Everything transcendental (`sin`, `sqrt`,
`perlin`, `random`) is "close" but its exact bits are firmware-internal.

---

## 4. The pattern language

A pattern is written in a **JavaScript-derived** language. It is close enough to JS
that it reads naturally, but it is a *subset* with a few hard removals.

### The lifecycle hooks

The firmware looks for a few specially-named **exported** functions:

- **`render(index)`** — called once per pixel, per frame. `index` is which pixel.
  Inside, you call `hsv(...)` or `rgb(...)` to set that pixel's colour. This is the
  1D form.
- **`render2D(index, x, y)`** and **`render3D(index, x, y, z)`** — the same idea but
  the firmware also hands you the pixel's mapped coordinates. The firmware picks the
  right one automatically based on whether a 2D or 3D map is installed; a single
  pattern can define more than one.
- **`beforeRender(delta)`** — called once *before* each frame. `delta` is the
  elapsed milliseconds since the last frame (high resolution). Use it to advance
  animation time so motion is frame-rate-independent.

A global **`pixelCount`** is always available (even during init) and reflects the
device's configured LED count.

### What's supported, and what's deliberately not

**Supported:** `var` (and implicit globals via bare assignment), `if`/`else`,
`while`/`for` with `break`/`continue`, the ternary `?:`, functions (both
`function f(){}` and arrow `f = x => ...` forms), functions as values, arrays (via
`array(n)` or literals), and the full math operator set on fixed-point numbers.
Logical operators carry the value, not just a boolean (`0 || 42 === 42`).

**Not supported (will not run on hardware):**

- **Objects / named properties / classes** — there are no object literals or `.`
  properties (arrays are the only aggregate).
- **`let` / `const`** — only `var` or implicit globals.
- **`switch` / `case`** — use chained `else if`, or an array of functions as a jump
  table (`modes[current]()`).
- **Closures** — a function defined inside another does *not* capture the outer
  function's locals or parameters. It sees globals and its own params only.
- **`new`, `try`/`catch`/`throw`, `import`** — none of these exist.
- **Freeing memory** — arrays are the only dynamic allocation and cannot be freed.

A useful rule of thumb: **globals and arrays are your only state**. No objects, no
closures-over-locals, no exceptions.

### Variables and `export`

Variables are global unless declared with `var` *inside* a function. Implicit
assignment (`foo = 1`) always creates a global, even inside a function. Prefixing a
global with **`export`** makes it visible to the Var Watcher and to the `getVars`/
`setVars` WebSocket API — that's the mechanism by which a host can read and poke a
running pattern's state.

### Controls — UI generated from code

A pattern grows a UI control simply by **exporting a function with a magic name
prefix**. The firmware (and any host app) renders the matching widget and calls the
function when the control changes — and once at pattern load with the saved value.
The full set:

| Prefix | Widget | Signature | Direction |
|---|---|---|---|
| `slider` | range slider 0–1 | `(v)` | input |
| `toggle` | on/off switch | `(isOn)` 1/0 | input |
| `hsvPicker` | colour well (HSV) | `(h, s, v)` each 0–1 | input |
| `rgbPicker` | colour well (RGB) | `(r, g, b)` each 0–1 | input |
| `trigger` | momentary button | `()` — *not* called at load | input |
| `inputNumber` | free numeric field | `(v)` any number | input |
| `showNumber` | read-only number display | `() => number` | **output** (polled) |
| `gauge` | 0–1 bar display | `() => number` | **output** (polled) |

Input controls are *push* (called on change); output controls are *pull* (the host
calls them frequently and displays the return value). Control values persist per
pattern across restarts and pattern switches.

### The standard library (built-ins)

Built-ins are called bare, with no namespace (`sin(x)`, not `Math.sin`). The main
families:

- **Math**: `abs floor ceil round trunc min max clamp sin cos tan asin acos atan
  atan2 sqrt exp log log2 pow hypot hypot3 mod frac` plus `random`, and the seeded
  `prng`/`prngSeed`. Note `mod` is the *floored* remainder (sign of `y`), unlike
  `%`; and `frac` truncates toward zero (so `frac(-5.5) === -0.5`).
- **Constants**: `PI PI2 PI3_4 PISQ E LN2 LN10 LOG2E LOG10E SQRT1_2 SQRT2`.
- **Waveforms**: `time(interval)` (a 0..1 sawtooth that loops every
  `interval × 65.536` s — the master animation clock), `wave` (sawtooth → sine),
  `triangle`, `square(v, duty)`, `mix`, `smoothstep`, `bezierQuadratic/Cubic`.
- **Noise**: `perlin` and the fractal family `perlinFbm/Ridge/Turbulence` +
  `setPerlinWrap`.
- **Colour**: `hsv`, `hsv24` (24-bit only), `rgb`, `setPalette(array)`,
  `paint(value, [brightness])`.
- **Coordinate transforms**: a transform *stack* — `translate scale rotate
  rotateX/Y/Z translate3D scale3D transform resetTransform` (up to 31 transforms);
  they modify the coordinates fed to the next render cycle. `scale(2,2)` makes
  things appear *half* as large (it densifies the coordinate space).
- **Map introspection**: `pixelCount`, `has2DMap`, `has3DMap`,
  `pixelMapDimensions`, `mapPixels(fn)`.
- **Arrays**: `array(n)` plus a rich functional set (`map`/`mapTo`, `mutate`,
  `reduce`, `sort`/`sortBy`, `sum`, `forEach`, `replace`), usable as functions or
  methods (`a.sort()`).
- **Clock** (when networked): `clockYear/Month/Day/Hour/Minute/Second/Weekday`.
- **Sync / sequencer**: `nodeId`, `sequencerNext`, `playlist*` for controlling the
  on-device playlist from within a pattern.
- **I/O**: `analogRead`/`readAdc`, `digitalRead/Write`, `pinMode`, `touchRead`.
- **Sensor expansion** (if the board is attached, accessed via `export var`):
  `frequencyData` (32-band FFT), `energyAverage`, `maxFrequency`/`Magnitude`,
  `accelerometer`, `light`, `analogInputs`.

---

## 5. Pixel maps — and why the mapper is a *different* JavaScript

A **pixel map** answers one question: *where is each LED physically located?* The
firmware does not assume your LEDs are a straight line. You give it a map, and it
hands each pixel's coordinates to `render2D`/`render3D` so a pattern can be written
in real space rather than chain order.

The crucial structural facts:

- **The chain index and the spatial position are decoupled.** LED #50 in the wiring
  order might sit anywhere. The map is the lookup from index → position.
- **`pixelCount` and the map are *separate* device settings.** The map function is
  handed `pixelCount` and returns positions; it is not the authority on how many
  pixels exist. They can disagree (and that's a real footgun — see below).
- **A device stores one map, shared by every pattern.** It is part of the
  *installation*, set once when you build the thing, not per-pattern.

### The mapper is plain browser JavaScript

This is the subtle dialect split, and it trips people up. The **Mapper** tab takes
a JavaScript function like:

```javascript
function (pixelCount) {
  var map = []
  for (var i = 0; i < pixelCount; i++) {
    map.push([Math.cos(i * 0.1), Math.sin(i * 0.1)])
  }
  return map
}
```

This function is **real, full JavaScript** — `Math.cos`, `Array.push`, the lot —
because **your browser runs it**, not the Pixelblaze. When you save the Mapper tab,
the browser evaluates the function, gets a coordinate array, and uploads *only that
array* to the device. The firmware stores the data and never sees the function.

Contrast that with a pattern, which is written in the *constrained, fixed-point*
Pixelblaze dialect and is executed *by the firmware* every frame. Same-looking
syntax, two genuinely different execution models:

| | Mapper function | Pattern |
|---|---|---|
| Language | full JavaScript | Pixelblaze dialect (subset) |
| Numbers | float64 | 16.16 fixed-point |
| Math | `Math.sin`, `Math.PI`, … | bare `sin`, `PI`, … |
| Who runs it | the **browser**, once at save | the **firmware**, every frame |
| What reaches the device | the baked coordinate array | the compiled pattern |

So: in a mapper you write `Math.floor(x)`; in a pattern you write `floor(x)`. Don't
mix them up.

### Two ways to author a map — in any units you like

The function above is the *generative* form, but the Mapper tab actually accepts
**either** of two formats:

- **A plain JSON array of coordinates** — one entry per pixel, each a `[x, y]` pair
  (2D) or `[x, y, z]` triplet (3D). A 4-pixel box is literally
  `[[0,0],[100,0],[100,100],[0,100]]`. Good for hand-placed or irregular layouts.
- **A JavaScript `function(pixelCount)`** that *returns* such an array — the
  generative form, good for repetitive or parametric structures (matrices, rings,
  helices). Either way the browser ends up with a coordinate array and uploads only
  that array.

Crucially, **you author in whatever real-world units suit the build** — inches,
millimetres, pixels, arbitrary grid steps. The firmware computes the world's extent
from the *limits* of the coordinates you gave it, then scales everything into the
`0..1` "world units" patterns actually see. So you never hard-code a magic scale: lay
out a 1500 mm tree in millimetres and it normalizes itself. (How the scaling handles
non-square extents is the Fill/Contain choice, next.)

### Fill vs. Contain — map coordinate normalization

After the mapper produces raw coordinates, the firmware **normalizes** them into a
predictable range before feeding them to patterns. The Mapper tab exposes a
**Fill / Contain** dropdown controlling how:

- **Contain** (the default): **aspect-preserving**. The longest axis is fit to
  `0..1`; shorter axes get a proportionally smaller range. A 15×10 map → x spans
  `0..1`, y spans `0..0.667`. A circle pattern stays a circle. No axis exceeds 1.
- **Fill**: **per-axis stretch**. Each axis independently fills `0..1`, so a 4:1 map
  fills the unit square and a circle becomes an ellipse.

Both are real, faithful hardware behaviours (verified on a 16×16 matrix, 2026-06-01,
against a `y >= 0.9` test pattern: under Fill, `y` reached 1.0; under Contain it
capped low). Contain is the sensible default; Fill is occasionally what you want when
a pattern is authored against the unit square regardless of physical shape.

### The stale-map footgun

Because the mapper runs *once at save* and only the data is stored, **changing
`pixelCount` does not re-run the mapper.** The map silently goes stale: if you grow
your strip from 100 to 200 LEDs, the stored 100-point map still applies, and the
new pixels fall off the end (typically piling at the origin). ElectroMage's own
guidance: *"if you rely on pixelCount and change the number of pixels, visit the
mapper page and save it to re-generate the pixel map."* This is by-design behaviour,
not a bug, and any faithful tool must reproduce it rather than paper over it.

### Map dimensionality

A map is 1D, 2D, or 3D. `pixelMapDimensions()` reports it (0 = no map). With no map
installed, `render` is used and `x` degenerates to `index/pixelCount`. Note that
"1D" really means "a strip" — a `render()` pattern takes no coordinates at all, yet
is still spatially one-dimensional.

---

## 6. How a pattern becomes light: compilation and the render loop

Putting §3–§5 together, here is the end-to-end story on real hardware:

1. **You edit source** in the device's web editor (or paste it in). Every keystroke,
   the editor sends the source to the device, which **compiles it to bytecode** on
   the fly. Syntax and runtime errors come back to the editor.
2. If it compiles, the device **stores** the pattern and starts running it.
3. **Per frame**, the firmware calls `beforeRender(delta)` once, then `render*(...)`
   once per pixel (`0 … pixelCount-1`), handing each the mapped coordinates. The
   pattern sets each pixel's colour via `hsv`/`rgb`.
4. The firmware pushes the resulting colours out to the LED strip and repeats, as
   fast as the pattern and pixel count allow.

Everything in that loop is **fixed-point** and **single-core**. There is a hardware
**watchdog**: a pattern that hangs is killed, unlike a naive software emulation
which would just freeze.

Patterns are exchanged as **`.epe` files** (a JSON envelope containing the source,
among other fields), and the device assigns each stored pattern a random **pattern
ID** like `7MuJmcy4FZbs9jGbB`, stable within a board across edits.

---

## 7. The WebSocket API — how anything talks to a Pixelblaze

All remote control happens over a **WebSocket on `ws://<device>:81`**, mixing JSON
text frames and binary frames. This is the same API the device's own web app uses,
and the API that third-party tools
([Firestorm](https://github.com/simap/Firestorm),
[pixelblaze-client](https://github.com/zranger1/pixelblaze-client)) build on.

The documented JSON surface:

- **`{"getVars": true}`** → `{vars: {...}}`: read all exported variables (sampled
  after the last pixel of a frame renders).
- **`{"setVars": {...}}`**: write exported variables on the active pattern.
- **`{"listPrograms": true}`** → a **binary** frame protocol (tab-separated
  id/name pairs, possibly split across frames with start/end flags) listing stored
  patterns.
- **`{"activeProgramId": "<id>"}`**: switch the active pattern (persists across
  reboot).
- **`{"brightness": 0.5}`**: set global brightness (not persisted).
- **`{"getControls": "<id>"}` / `{"setControls": {...}, "save": true}`**: read/write
  a pattern's UI control values. Control writes aren't persisted unless `save: true`
  (to spare flash wear).

There are also **undocumented binary frames** — notably the chunked pattern *upload*
path (source/bytecode push) — which this project reverse-engineered and verified
(fw 3.67) from `pixelblaze-client`'s work.

### Why a browser can't reach a device directly

This constraint shapes any web-based tool. A Pixelblaze speaks only `ws://` (plain,
no TLS — there is no `wss://`). A web page served over **https** that tries to open
`ws://192.168.x.x:81` is **mixed active content** and is blocked outright by the
browser — no prompt, no override beyond a fragile per-site toggle. WebSockets don't
use CORS, so the socket *handshake* itself would be fine; it's the https→ws
downgrade that's the wall.

The practical consequence: a deployed (https) web app cannot talk to a Pixelblaze on
its own. It needs a **local helper process** running outside the browser sandbox
(on the LAN) that the page can reach at `ws://127.0.0.1` (localhost is exempt from
mixed-content blocking) and which in turn reaches the device. ElectroMage's own
Firestorm is exactly such a local process. (PXLBLZ's stance on that is in the IDE
Technical Reference §Hardware connectivity.)

### Discovery

Devices in client mode can register with ElectroMage's cloud discovery service
(`discover.electromage.com`), which matches controllers by your public IP and
returns each one's LAN IP. V2.10+ devices also emit UDP broadcast beacons. Both
require a LAN-resident caller (the cloud endpoint sends no CORS header; UDP can't be
heard from a browser), so discovery, too, belongs to a local helper or manual IP
entry.

---

## 8. Networking & operating modes (brief)

- **Client mode**: the device joins your existing WiFi. Best for development (you
  keep internet access), firmware updates, and the clock functions (which need
  network time).
- **AP mode**: the device creates its own WiFi network you join directly (at
  `192.168.4.1`). For wearables/mobile installs with no infrastructure.
- **Setup mode**: on first boot or after a 5-second button hold, the device offers a
  `Pixelblaze_XXXXXX` setup network.
- **Sync groups / Firestorm**: multiple Pixelblazes can be synchronised (patterns
  using `time()` stay phase-locked) and remotely orchestrated as a fleet.

---

## 9. The one-paragraph version

A Pixelblaze is a standalone WiFi LED controller that runs small **patterns** —
JavaScript-subset programs, executed by the firmware in **16.16 fixed-point**, that
compute a colour per LED per frame. A **pixel map** tells the firmware where each
LED physically sits; crucially, the map *function* is **full JavaScript that runs in
your browser** and uploads only a coordinate array, while the *pattern* is the
constrained fixed-point dialect the *device* runs — same syntax, different worlds.
The device compiles patterns to bytecode on upload, stores one shared map per
installation, and exposes everything (vars, controls, brightness, pattern list,
upload) over a `ws://:81` WebSocket — which an https web page can't reach directly,
forcing any deployed web tool to lean on a LAN-side helper. Fixed-point overflow,
the Fill/Contain normalization choice, and the stale-map-on-pixelCount-change
behaviour are all real, deliberate device traits, not bugs — and anything claiming
to faithfully preview a Pixelblaze has to reproduce them.
