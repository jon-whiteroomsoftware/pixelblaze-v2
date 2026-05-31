# Map functions are plain JavaScript, baked in-browser, never run through the fixed-point shim

**Status:** accepted

A custom map's authoring source (the `function(pixelCount){ … return coords }`) is **plain JavaScript**, evaluated by a plain JS evaluator (`new Function`, float64) once at save and **baked** into a coordinate array (ADR-0007). It is **never** run through the Pixelblaze fixed-point shim, and the map editor is a **JavaScript** surface, not a Pixelblaze-dialect one. This is the opposite of how patterns are treated — and that asymmetry is the whole point.

## Why

This mirrors hardware exactly. On a real Pixelblaze the **Mapper** tab takes a JS function, the **browser** evaluates it when you save, and only the resulting coordinate array is uploaded to and stored on the controller. The device holds map *data*, not the function; the firmware hands those stored coordinates to a pattern as its `x, y[, z]` arguments. The mapper function therefore **never executes on the Pixelblaze runtime** — it is authoring-time browser JavaScript.

Patterns are the opposite. A pattern is written in Pixelblaze's JS-*derived* language and, on the device, is executed by the firmware's fixed-point expression engine. The IDE preview only *approximates* that runtime with `new Function` + a shim — float64 (Fast) or 16.16 fixed-point (Precise) — which is the entire reason ADR-0001/0003 and the "divergence" vocabulary exist.

| | language | who runs it | IDE fidelity |
|---|---|---|---|
| **Mapper function** | plain JavaScript | the **browser** (device *and* IDE) | bit-identical by construction |
| **Pattern** | Pixelblaze dialect | the **firmware runtime** (device) / shim (IDE) | approximate (fixed-point divergence) |

The payoff: map evaluation in the IDE is **faithful by construction**. We do literally what the device's browser does, so there is no map-side divergence to characterise or chase.

## Considered options

- **Treat map source as Pixelblaze dialect and evaluate it through the fixed-point shim** (rejected) — superficially "consistent" with patterns and with ADR-0003's fidelity push, but it is *wrong*: it would manufacture fixed-point rounding the real device never applies to a map (the device bakes the map in float64 JS in the browser), introducing a divergence where none exists.

## Extension — stock maps are source-backed too, and the source is the single source of truth

This ADR originally spoke only of *custom* map source. It now extends to **stock maps**: every 2D/3D stock map (plane, ring, cube, sphere, helix) is backed by a real plain-JS `function(pixelCount)`, and that source is the **single source of truth** — the live preview *runs the source* (the same `new Function`, float64, no-shim primitive), rather than a parallel TS generator. There is no display-only copy to drift against; the `.js` a curious user reads is byte-identical to the `.js` the preview runs. Consequences specific to stock maps:

- **Live regeneration.** Each stock source takes `pixelCount` and regenerates for any count, so a stock map never goes stale — baked replay (ADR-0007) is reserved for custom maps.
- **Hardware-Mapper-faithful, self-contained.** The source reads like a function pasteable into a real Pixelblaze Mapper tab: `Math.*` and language built-ins only, no IDE helpers, no library imports, no namespacing. (Maps deliberately don't get the pattern library system — matching hardware.)
- **Raw geometry; engine normalizes.** The source returns natural-unit coordinates; a single shared engine pass normalizes per-axis into `[0,1]`, mirroring firmware's bake-time normalization. The per-axis-vs-aspect question (#116) lives in that one pass.
- **Templates.** Loading a stock map's source into the New Map editor is the only way to view stock-map code; it forks an editable custom copy (source text only — name and `dim` are not carried).
- **One exception: the drape cylinder.** Its `sample ≠ pos` divergence has no single faithful Mapper function, so it carries no source and is neither viewable nor copyable — an IDE-only preview construct.

## Consequences

- The editor's **map mode** uses a JavaScript language mode and a JS-parse compile badge — distinct from a pattern's Pixelblaze mode and from the Precise/Fast renderer toggle (neither applies to maps).
- ADR-0007's "evaluated via the same `new Function` path the pattern runtime uses" is refined: the same `new Function` *primitive*, but **without** the fixed-point shim wrapper. Same evaluator, deliberately no fidelity layer.
- A `MapRecord`'s `source` is plain JS. Re-opening and editing it is a JS editing experience; baking it is a one-shot float64 evaluation, normalized per-axis into 0..1 (the per-axis-vs-aspect open question, #116, is unchanged by this ADR).
