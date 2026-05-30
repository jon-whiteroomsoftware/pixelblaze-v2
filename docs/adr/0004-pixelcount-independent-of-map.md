# Pixel count is modeled independently of the map

**Status:** accepted

`pixelCount` is a first-class setting in the data model, separate from the pixel map. The render loop iterates `index = 0 … pixelCount-1` and asks the active map for each index's position; the map is purely an index→position lookup (`resolve(pixelCount) → MapPoint[]`), never the authority on *how many* pixels there are. This mirrors hardware, where `pixelCount` is a device software setting and the map function is handed `pixelCount` and returns positions — so the model round-trips cleanly to a real controller later. In the offline preview `pixelCount` is synthetic (the user picks it), but it lives in the model and flows through the render pipeline identically to how it would from a connected controller.

## Considered options

- **Derive `pixelCount` from `map.points.length`** (rejected). Simpler for an offline-only preview and removes the "count ≠ map length" mismatch state, but it has no clean hardware analogue: a controller's `pixelCount` and installed map are genuinely separate settings that can disagree. Deriving count from the map would force an awkward translation when connecting real controllers (Phase 3) and when previewing against a device's actual `pixelCount`.

## Consequences

- The nested `rows × cols` render loop is replaced by a single `pixelCount` loop that reads positions from the map.
- Count-intrinsic stock maps (grid, cube) are map-functions that take a shape param and derive their layout from `pixelCount` — e.g. `grid` takes a `cols` (aspect) param and derives rows, exactly as a hardware matrix map function hardcodes its width. The grid keeps its existing `rows × cols` editing UI (so `pixelCount` = rows×cols and the 2D no-regression path is preserved); every other map edits `pixelCount` directly.
- `pixelCount` and the `maps` object store both touch persisted shape — see the persistence-migration risk in the feature PRD.
