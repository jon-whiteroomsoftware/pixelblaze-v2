# The Pixelblaze Ecosystem — A Primer

For Pixelblaze owners who have at least opened the device's built-in editor. This
document is about **Pixelblaze itself** — the hardware, firmware, language, and
workflow ElectroMage built. For the PXLBLZ IDE, see the **PXLBLZ Feature Guide**
(what it does) or the **PXLBLZ Technical Reference** (how it's built).

**The whole document in two sentences.** A Pixelblaze is a standalone WiFi LED
controller that runs small JavaScript-like **patterns** in 16.16 **fixed-point**
arithmetic, computing a colour for every LED many times per second, guided by an
optional **pixel map** that records where each LED physically sits. Nearly every
quirk of the platform — the constrained language, the overflow traps, the map that
silently goes stale — falls out of a handful of structural facts, and this primer's
job is to hand you those facts before the details arrive.

**Part 1** is the mental model: enough to reason correctly about the platform, and a
quick preconception check if you already know it. **Part 2** is the detail layer:
exact semantics, reference tables, a worked power budget, and troubleshooting —
deliberately deepest where ElectroMage's own docs are thinnest. Behaviour this
project has verified on real hardware (overflow, truncation, Fill/Contain) is called
out as such.

---

# Part 1 — The mental model

## 1. What a Pixelblaze is

A **Pixelblaze** is a small WiFi microcontroller (ESP-based) from
[ElectroMage](https://electromage.com/) that drives addressable LEDs — strips,
matrices, rings, 3D sculptures. You write a small program — a **pattern** — and the
controller runs it in a tight loop, computing a colour for every LED, many times per
second.

Three traits define the platform:

- **Self-contained.** The controller stores your patterns in flash, runs them
  standalone (no computer attached), and serves its own editor web app from its own
  IP address. You point a browser at the device and edit live.
- **Networked, not tethered.** You talk to it over WiFi via a WebSocket API on
  port 81. USB is power only; there is no USB data protocol.
- **Fixed-point.** Every number a pattern touches is a 16.16 fixed-point value, not
  a float. This one fact explains a large share of the platform's behaviour (§3).

Hardware comes in several variants — V2, V3 Standard, V3 Pico, plus an Output
Expander (many parallel LED channels) and a Sensor Expansion board (sound, motion,
light). The differences mostly matter for wiring; the language and workflow are
common across them. Supported LED types and powering are covered in §13.

## 2. Device vs. browser — who owns what

The single most important thing to internalise is **which half of the system owns
what**. Pixelblaze splits cleanly into a *device* side and a *browser* side, and
most of its design choices only make sense once you see that line.

![Who owns what: the browser authors, the device runs](../images/device-browser-boundary.svg)

| Concern | Lives on the **device** (firmware) | Lives in the **browser** (authoring) |
|---|---|---|
| Pattern *source* | stored in flash | edited here |
| Pattern *execution* | the fixed-point engine runs it per frame | — |
| Pattern *compilation* | compiled source → bytecode on upload | — |
| The **pixel map** | stored as a coordinate *array* (positions only) | the map *function* runs here to produce that array |
| `pixelCount` | a device setting | — |
| Controls (sliders, etc.) | values persisted per pattern | rendered as widgets |

Two consequences fall out of this split and recur everywhere:

1. **The device stores map *data*, not the map *function*.** When you write a
   mapper function, *your browser* evaluates it and uploads only the resulting list
   of coordinates. The function never runs on the Pixelblaze — which is why the
   mapper is plain JavaScript (§5).
2. **The pattern is the only thing the firmware actually runs** — in fixed-point,
   after compiling it to bytecode. "It worked in a float-math preview" is not the
   same as "it works on hardware."

## 3. Every number is fixed-point

Every value a pattern computes is a **16.16 fixed-point** number: a signed 32-bit
integer interpreted as `value × 65536`. The range is roughly **−32768 to +32768**,
the smallest step is **1/65536**, and overflow **wraps** rather than saturating.

This is not an implementation detail you can ignore — it shapes how patterns are
written:

- **Patterns live in the 0–1 range.** Hue, saturation, brightness, coordinates,
  and waveform phases are all 0..1. Staying near 0–1 keeps you far from overflow
  and gives you the most fractional precision.
- **Large intermediates overflow silently.** The classic trap is the GLSL shader
  hash `fract(sin(p · 12.9898) · 43758.5453)`: the `· 43758` blows past 32768 and
  wraps. On a float machine it looks perfect; on a Pixelblaze it turns to noise.
  Porting GPU shaders means rewriting anything that relies on big numbers.
- **Only integer arithmetic is exactly predictable.** Everything transcendental
  (`sin`, `sqrt`, `perlin`, `random`) is "close", but its exact bits are
  firmware-internal.

Exact semantics — truncation rules, bitwise behaviour, what was verified on real
hardware — are in §8.

## 4. Patterns — the program the device runs

A pattern is written in a **JavaScript-derived** language: close enough to JS to
read naturally, but a subset with hard removals (§9).

The firmware looks for a few specially-named **exported** functions:

- **`render(index)`** — called once per pixel, per frame. Inside, call `hsv(...)`
  or `rgb(...)` to set that pixel's colour. This is the 1D form.
- **`render2D(index, x, y)`** / **`render3D(index, x, y, z)`** — the same, but the
  firmware also hands you the pixel's mapped coordinates. It picks the right one
  automatically based on the installed map's dimensionality; one pattern can define
  several.
- **`beforeRender(delta)`** — called once before each frame, with the elapsed
  milliseconds since the last one. Use it to advance animation time so motion is
  frame-rate-independent.

A global **`pixelCount`** always reflects the device's configured LED count. The
useful rule of thumb for state: **globals and arrays are all you get** — no
objects, no closures over locals, no exceptions (§9).

Patterns grow a UI for free: **export a function with a magic name prefix**
(`sliderSpeed`, `toggleMirror`, `hsvPickerColor`, …) and the device's editor — or
any host app — renders the matching widget and feeds your function its value.
Control values persist per pattern.

How a pattern becomes light:

1. You edit source in the device's web editor. On every change, the editor sends
   the source over; the device **compiles it to bytecode** on the fly and reports
   errors back.
2. If it compiles, the device stores it and starts running it.
3. Per frame: `beforeRender(delta)` once, then `render*()` once per pixel with its
   mapped coordinates, then the colours are pushed out to the strip. Repeat as fast
   as the pattern and pixel count allow.

The loop is fixed-point and single-core, with a hardware **watchdog** that kills a
hung pattern. Patterns travel between devices as **`.epe`** files (a JSON envelope
holding the source), and each stored pattern gets a random, stable **pattern ID**
like `7MuJmcy4FZbs9jGbB`.

## 5. Maps — where the LEDs are

A **pixel map** answers one question: *where is each LED physically located?* The
firmware doesn't assume your LEDs are a straight line. Give it a map, and it hands
each pixel's coordinates to `render2D`/`render3D`, so a pattern is written in real
space rather than wiring order.

The structural facts:

- **Chain index and spatial position are decoupled.** LED #50 in the wiring order
  might sit anywhere. The map is the lookup from index → position.
- **`pixelCount` and the map are separate device settings.** The map function is
  *handed* `pixelCount`; it is never the authority on how many pixels exist. The
  two can disagree — a real footgun (§10).
- **A device stores one map, shared by every pattern.** It's part of the
  installation, set when you build the thing, not per-pattern.

![The map pipeline: function → array → device → render2D](../images/map-pipeline.svg)

The subtle part is the **dialect split**. The Mapper tab takes a JavaScript
function like:

```javascript
function (pixelCount) {
  var map = []
  for (var i = 0; i < pixelCount; i++) {
    map.push([Math.cos(i * 0.1), Math.sin(i * 0.1)])
  }
  return map
}
```

This is **real, full JavaScript** — `Math.cos`, `Array.push`, the lot — because
**your browser runs it**, not the Pixelblaze. On save, the browser evaluates it once
and uploads only the coordinate array. A pattern, by contrast, is the constrained
fixed-point dialect the *firmware* executes every frame. Same-looking syntax, two
genuinely different execution models:

| | Mapper function | Pattern |
|---|---|---|
| Language | full JavaScript | Pixelblaze dialect (subset) |
| Numbers | float64 | 16.16 fixed-point |
| Math | `Math.sin`, `Math.PI`, … | bare `sin`, `PI`, … |
| Who runs it | the **browser**, once at save | the **firmware**, every frame |
| What reaches the device | the baked coordinate array | the compiled pattern |

So in a mapper you write `Math.floor(x)`; in a pattern you write `floor(x)`. Don't
mix them up.

You author maps in **whatever units fit the build** — millimetres, inches, grid
steps. The firmware computes the world's extent from your coordinates' limits and
normalizes everything into the `0..1` "world units" patterns actually see, so a
1500 mm tree laid out in millimetres scales itself. How non-square extents
normalize is the Fill/Contain choice (§10).

## 6. Talking to a Pixelblaze

All remote control happens over a **WebSocket on `ws://<device>:81`**, mixing JSON
text frames and binary frames. It's the same API the device's own editor uses, and
what third-party tools ([Firestorm](https://github.com/simap/Firestorm),
[pixelblaze-client](https://github.com/zranger1/pixelblaze-client)) build on. Over
it you can read and write a running pattern's exported variables, switch patterns,
set brightness, and drive controls (§11).

One constraint shapes every web-based tool: a Pixelblaze speaks only plain `ws://`
(no TLS), and a page served over **https** is forbidden by the browser from opening
a plain-`ws://` LAN connection — mixed active content, blocked outright. So a
deployed web app can't talk to a Pixelblaze on its own; it needs a helper outside
the browser sandbox — a local process (ElectroMage's Firestorm is exactly this) or
a browser extension (the route PXLBLZ takes). Details and discovery in §11.

## 7. The model in one paragraph

A Pixelblaze is a standalone WiFi LED controller that runs small **patterns** —
JavaScript-subset programs, executed by the firmware in **16.16 fixed-point**, that
compute a colour per LED per frame. A **pixel map** tells the firmware where each
LED physically sits; crucially, the map *function* is **full JavaScript that runs
in your browser** and uploads only a coordinate array, while the *pattern* is the
constrained fixed-point dialect the *device* runs — same syntax, different worlds.
The device compiles patterns to bytecode on upload, stores one shared map per
installation, and exposes everything (vars, controls, brightness, pattern list,
upload) over a `ws://:81` WebSocket — which an https web page can't reach directly,
forcing any deployed web tool to lean on a LAN-side helper. Fixed-point overflow,
the Fill/Contain normalization choice, and the stale-map-on-pixelCount-change
behaviour are all real, deliberate device traits, not bugs — and anything claiming
to faithfully preview a Pixelblaze has to reproduce them.

---

# Part 2 — Details, reference, and footguns

## 8. Fixed-point, precisely

The number format is a signed 32-bit integer read as `value × 65536`:

- **Range** ≈ −32768 to +32768; **precision** 1/65536 (≈ 0.0000153).
- **Overflow wraps** (int32 wrap), not saturates — verified against a real device
  (fw 3.67).
- **Bitwise operators act on all 32 bits** (16 integer + 16 fraction) — different
  from JavaScript, which coerces to a 32-bit integer first. The documented
  exception is `~`, which zeros the low 16 bits, so `~x` operates on the integer
  part. This project verified that the device's bitwise ops effectively
  integer-coerce operands (`~2.5 → -3`).
- **Multiply, `frac`, and `%` truncate** toward the sign of the dividend; **divide
  also truncates** on the device. Power-of-two divides are exact.

The takeaway for a pattern author: *integer-only arithmetic is the only thing that
is bit-exact and overflow-predictable.* Everything transcendental is close, but
its exact bits are firmware-internal.

## 9. The pattern language, in detail

### What will not run on hardware

- **Objects, named properties, classes** — no object literals, no `.` properties;
  arrays are the only aggregate.
- **`let` / `const`** — only `var`, or implicit globals via bare assignment.
- **`switch` / `case`** — use chained `else if`, or an array of functions as a
  jump table (`modes[current]()`).
- **Closures** — a function defined inside another does *not* capture the outer
  function's locals or parameters. It sees globals and its own params only.
- **`new`, `try`/`catch`/`throw`, `import`** — none of these exist.
- **Freeing memory** — arrays are the only dynamic allocation and cannot be freed.

What *is* supported: `var`, `if`/`else`, `while`/`for` with `break`/`continue`,
the ternary, functions in both `function f(){}` and arrow forms, functions as
values, arrays, and the full math operator set. Logical operators carry the value,
not just a boolean (`0 || 42 === 42`).

### Variables and `export`

Variables are global unless declared with `var` *inside* a function — implicit
assignment (`foo = 1`) creates a global even there. Prefixing a global with
**`export`** makes it visible to the Var Watcher and to the `getVars`/`setVars`
WebSocket API; that is the mechanism by which a host reads and pokes a running
pattern's state.

### Controls

Exporting a function with a control-prefix name grows the matching widget. Input
controls are *push* (called on change, and once at load with the saved value —
except `trigger`); output controls are *pull* (the host polls them and displays
the return value). Values persist per pattern across restarts.

| Prefix | Widget | Signature | Direction |
|---|---|---|---|
| `slider` | range slider 0–1 | `(v)` | input |
| `toggle` | on/off switch | `(isOn)` 1/0 | input |
| `hsvPicker` / `rgbPicker` | colour well | `(h,s,v)` / `(r,g,b)` each 0–1 | input |
| `trigger` | momentary button | `()` — not called at load | input |
| `inputNumber` | free numeric field | `(v)` | input |
| `showNumber` | read-only number | `() => number` | output (polled) |
| `gauge` | 0–1 bar display | `() => number` | output (polled) |

### Built-ins — the families, and the gotchas worth knowing

Built-ins are called bare, no namespace (`sin(x)`, not `Math.sin`). The full
catalogue lives in ElectroMage's language reference
([electromage.com/docs](https://electromage.com/docs), mirrored in this repo under
`docs/ElectroMage/`); what follows is the shape of it plus the traps it
under-explains.

- **Math & constants** — the usual trig/rounding/clamping set plus `hypot`,
  `hypot3`, `random`, and the seeded `prng`. Gotchas: **`mod` is the floored
  remainder** (sign of the divisor) while **`%` truncates** (sign of the
  dividend), and **`frac` truncates toward zero** — `frac(-5.5) === -0.5` — unlike
  GLSL's floor-based `fract`. Symmetric folds built on the wrong one break for
  negatives.
- **Waveforms** — `time(interval)` is the master animation clock, a 0..1 sawtooth
  that loops every **`interval × 65.536` seconds** (so `time(.015)` ≈ once a
  second — the odd unit is a fixed-point artifact). `wave` turns it into a
  sinusoid; `triangle` and `square` are the cheap periodic shapes; `mix`,
  `smoothstep`, and beziers interpolate. Patterns driven by `time()` stay
  phase-locked across synchronised devices.
- **Noise** — `perlin` and the fractal family (`perlinFbm`/`Ridge`/`Turbulence`).
- **Colour** — `hsv` (hue wraps), `rgb`, `hsv24`, palettes via
  `setPalette`/`paint`.
- **Coordinate transforms** — a transform *stack* (`translate`, `scale`, `rotate`,
  3D variants, up to 31 entries) that modifies the coordinates fed to the next
  render cycle. Gotcha: `scale(2,2)` makes the image appear *half* as large — it
  densifies the coordinate space, not the picture.
- **Arrays** — `array(n)` plus a functional set (`map`, `mutate`, `reduce`,
  `sort`, `sum`, …), usable as functions or methods. Gotchas (verified, fw 3.67):
  `array(0)` is rejected, out-of-range indexing throws rather than clamping, and
  arrays can never be freed.
- **Map introspection** — `pixelCount`, `has2DMap`/`has3DMap`,
  `pixelMapDimensions`, `mapPixels(fn)`.
- **Clock, sequencer, I/O, sensors** — wall-clock functions (need network time),
  on-device playlist control, GPIO/analog reads, and — with the sensor board —
  `frequencyData` (32-band FFT), `energyAverage`, `accelerometer`, `light`, read
  via `export var`.

For which built-ins are cheap and which are expensive on hardware, see
**Optimizing Pixelblaze patterns** — the short version is that `exp` and `pow`
cost several times what `sin` does, and `wave` is *not* cheaper than `sin`.

## 10. Maps, in detail

### Two source formats, any units

The Mapper tab accepts either:

- **A plain JSON array of coordinates** — one `[x, y]` pair (2D) or `[x, y, z]`
  triplet (3D) per pixel. A 4-pixel box is literally
  `[[0,0],[100,0],[100,100],[0,100]]`. Good for hand-placed, irregular layouts.
- **A JavaScript `function(pixelCount)`** returning such an array — the generative
  form, good for parametric structures (matrices, rings, helices).

Either way the browser ends up with a coordinate array and uploads only that.
Units are yours; the firmware normalizes from the coordinates' limits (§5).

### Fill vs. Contain

After the mapper produces raw coordinates, the firmware **normalizes** them into a
predictable range. The Mapper tab's **Fill / Contain** dropdown controls how:

![Fill vs Contain: aspect-preserving vs per-axis stretch](../images/fill-vs-contain.svg)

- **Contain** (default): aspect-preserving. The longest axis fits `0..1`; shorter
  axes get a proportionally smaller range (a 15×10 map → x spans `0..1`, y spans
  `0..0.667`). A circle stays a circle; no axis exceeds 1.
- **Fill**: per-axis stretch. Each axis independently fills `0..1`, so a 4:1 map
  fills the unit square and a circle becomes an ellipse.

Both are real hardware behaviours (verified on a 16×16 matrix against a
`y >= 0.9` probe pattern: under Fill, `y` reached 1.0; under Contain it capped
low). Contain is the sensible default; Fill is occasionally right when a pattern
is authored against the unit square regardless of physical shape.

### The stale-map footgun

The mapper runs *once at save*, and only the data is stored — so **changing
`pixelCount` does not re-run the mapper**. The map silently goes stale: grow your
strip from 100 to 200 LEDs and the stored 100-point map still applies, with the
new pixels falling off the end. ElectroMage's own guidance: *"if you rely on
pixelCount and change the number of pixels, visit the mapper page and save it to
re-generate the pixel map."* This is by-design behaviour, and any faithful tool
must reproduce it rather than paper over it.

### The exact-count rule

There's a sharper, *push-time* sibling: **a map written to a device must contain
exactly `pixelCount` coordinates, or the device will not apply it.** Saving a
count-mismatched map appears to succeed but produces no visible change — the map
is dropped, not partially applied — and the reference client refuses to even parse
such a map on read-back. A tool that pushes maps must either generate exactly
`pixelCount` points or set the device's pixel count to match; the two are
inseparable.

### Dimensionality

A map is 1D, 2D, or 3D; `pixelMapDimensions()` reports it (0 = no map). With no
map installed, `render` is used and `x` degenerates to `index/pixelCount`. "1D"
really means "a strip" — a `render()` pattern takes no coordinates at all, yet is
still spatially one-dimensional.

## 11. The WebSocket API, in detail

### The documented JSON surface

- **`{"getVars": true}`** → `{vars: {...}}` — read all exported variables
  (sampled after the last pixel of a frame renders).
- **`{"setVars": {...}}`** — write exported variables on the active pattern.
- **`{"listPrograms": true}`** → a **binary** frame protocol (tab-separated
  id/name pairs, possibly split across frames) listing stored patterns.
- **`{"activeProgramId": "<id>"}`** — switch the active pattern (persists across
  reboot).
- **`{"brightness": 0.5}`** — set global brightness (not persisted).
- **`{"getControls": "<id>"}` / `{"setControls": {...}, "save": true}`** —
  read/write a pattern's UI control values; writes aren't persisted unless
  `save: true` (to spare flash wear).

There are also **undocumented binary frames** — notably the chunked pattern
*upload* path — which this project reverse-engineered and verified (fw 3.67),
building on `pixelblaze-client`'s work.

### Why a browser can't reach a device directly

A Pixelblaze speaks only `ws://` — plain, no TLS, no `wss://`. A page served over
**https** that tries to open `ws://192.168.x.x:81` is **mixed active content**,
blocked outright by the browser — no prompt, no realistic override. (WebSockets
don't use CORS, so the handshake itself would be fine; the https→ws downgrade is
the wall.)

The practical consequence: a deployed https web app needs a **helper outside the
browser sandbox**. Two shapes qualify: a **local process** the page reaches at
`ws://127.0.0.1` (localhost is exempt from mixed-content blocking — ElectroMage's
Firestorm is exactly this), or a **browser extension** whose service worker opens
the LAN socket the page can't and relays frames back. PXLBLZ takes the extension
route; see the Technical Reference §13.

### Discovery

Devices in client mode register with ElectroMage's cloud discovery service:
`discover.electromage.com` matches controllers by your public IP and returns each
one's LAN IP. V2.10+ devices also emit UDP broadcast beacons. Both paths need a
LAN-resident caller (the cloud endpoint sends no CORS header; a browser can't
hear UDP), so discovery, too, belongs to a helper — or you type the IP by hand.

## 12. Networking modes

- **Client mode** — the device joins your WiFi. Best for development (you keep
  internet access), firmware updates, and the clock functions (which need network
  time).
- **AP mode** — the device creates its own WiFi network you join directly (at
  `192.168.4.1`). For wearables and installs with no infrastructure.
- **Setup mode** — on first boot, or after a 5-second button hold, the device
  offers a `Pixelblaze_XXXXXX` setup network.
- **Sync groups / Firestorm** — multiple Pixelblazes can be synchronised
  (patterns using `time()` stay phase-locked) and orchestrated as a fleet.

## 13. Power — a worked example

ElectroMage's hardware guide has the per-LED numbers but no arithmetic, so here it
is. Supported LED families: APA102/SK9822 ("DotStar" — 4-wire, high dynamic range,
ElectroMage's recommendation), the WS2812/WS2811/WS2813/WS2815/SK6812 family
("NeoPixel" — 3-wire), and WS2801; RGBW variants are supported.

The planning rule: budget **about 20 mA per colour channel per pixel**, i.e.
**60 mA per RGB pixel at full white**. Then:

> A 16×16 WS2812 panel is 256 pixels. Worst case: 256 × 60 mA ≈ **15.4 A at 5 V
> (≈ 77 W)**. A running animation draws a fraction of that — most patterns light a
> minority of pixels at partial brightness — but the supply has to survive the
> worst case the pattern *could* produce, so either size it for full white or cap
> the global brightness and accept the headroom math.

Rules of thumb that follow:

- **USB power is for small jobs.** A 500 mA USB-2 port honestly powers only a
  handful of LEDs at full white; a 2–3 A phone charger manages a few dozen. Beyond
  that, use a dedicated 5 V supply sized as above.
- **Big strips need thick wires and multiple feed points.** Power delivered only
  at one end of a long strip sags along the way — the far end dims and shifts
  toward red (blue is the first channel to brown out). Feed power at both ends, or
  at intervals along the run.
- **Grounds must be common.** The controller and the LED supply must share ground,
  or the data signal has no reference and the strip glitches.

## 14. First-contact troubleshooting

The failure modes that actually happen, roughly in the order you'll meet them:

- **Brand-new device / can't see it at all.** A device with no WiFi configured
  broadcasts its own `Pixelblaze_XXXXXX` network. Join it and browse to
  `192.168.4.1` to pick client or AP mode.
- **Changed routers or WiFi password.** Hold the button ~5 seconds to drop back
  into setup mode and reconfigure.
- **It's on your LAN but you don't know its IP.** Visit
  [discover.electromage.com](https://discover.electromage.com) from the same
  network — devices that have reached the internet at least once register there
  and report their LAN IP. Failing that, your router's DHCP client table.
- **Editor connects, then drops — or won't connect at all.** The device has a
  small WebSocket connection pool. Stray editor tabs, other browser windows, and
  tools like Firestorm each hold a socket; close the extras before suspecting the
  device. (Verified the hard way.)
- **An https web tool can't reach it.** That's the mixed-content wall (§11), not a
  fault — the tool needs its LAN-side helper installed and running.
- **Editor works, LEDs dark or wrong colours.** Check the LED type and colour
  order in Settings, the data wiring (DAT vs CLK on 4-wire types), and that
  grounds are common (§13). Wrong colour order shows as red/green swaps; wrong
  type usually shows as chaos or nothing.
- **Clock functions return nonsense.** They need network time: client mode, with
  internet access.

## 15. Where ElectroMage's own docs are strong

This primer deliberately doesn't duplicate what's already well covered. The map
(all under [electromage.com/docs](https://electromage.com/docs), mirrored in this
repo under `docs/ElectroMage/`):

- **Quickstart (V3)** — physical setup, WiFi onboarding, LED connector wiring,
  with photos. Procedural and reliable; follow it literally.
- **Hardware Getting Started** — the electrical reference: LED types, per-channel
  current, connector pinouts. Good numbers; §13 above adds the arithmetic.
- **Language Reference** — the authoritative catalogue of every built-in,
  control, and language feature. Complete but flat; Part 1 of this primer is the
  "why" that it skips.
- **Maps and Map Editing** — map formats and worked generator examples. §5/§10
  give the mental model first.
- **WebSockets API** — the documented protocol surface; thin on the binary side
  (§11 covers what this project verified beyond it).
- **The [ElectroMage forum](https://forum.electromage.com)** — searchable, active,
  and the developer answers; the best source for hardware-revision quirks.

---

For making patterns fast on this hardware, see **Optimizing Pixelblaze patterns**
(`docs/guides/`). For everything about the PXLBLZ IDE itself, the **Feature
Guide**.
