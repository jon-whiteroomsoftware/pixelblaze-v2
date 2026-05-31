# Custom maps bake on save; pixelCount drift is exposed, not hidden

**Status:** accepted

A custom map (an authored point list, or a `function(pixelCount)` the user writes) is evaluated **once, at save time**, and the resulting coordinate array is **frozen into its `MapRecord`**. The map's `resolve(pixelCount)` then *replays* that baked array, index-aligned to the requested count: indices past the array's end fall back to the origin, surplus entries go unvisited. It does **not** re-run the authoring function on a `pixelCount` change. Selecting a custom map does **not** pin or adjust `pixelCount` — the two stay independent channels (ADR-0004), so a count that disagrees with the map's geometry renders the same degraded result a real Pixelblaze would show.

This is deliberate fidelity. On hardware the mapper function is run once when you save the Mapper tab, and the result is stored; *"if you rely on pixelCount and change the number of pixels, visit the mapper page and save it to re-generate the pixel map."* The map silently goes stale until re-saved, and a count/map mismatch lights only the indices the count reaches. The IDE's guiding principle for the preview is that limitations real on hardware should be visible here too — if a configuration breaks on a Pixelblaze, it should break the same way in the preview rather than being quietly corrected.

## Considered options

- **Pin `pixelCount` to a custom map's point count and lock the knob** (rejected). Prevents the mismatch state entirely and reads as "helpful," but it hides a real hardware footgun (count and map are genuinely separate device settings that can disagree) and contradicts ADR-0004. The user would never see — and so never learn to avoid — the stale-map drift that bites on a real device.
- **Live re-resolve custom maps on every `pixelCount` change** (rejected). More convenient and consistent with how *stock* maps behave (they regenerate for any count), but it manufactures positions hardware never would and erases the "changed pixelCount, forgot to re-save the mapper" drift this ADR exists to reproduce.

## Amendment — baked replay is custom-only

Originally some stock maps (the example clouds: helix/sphere/ring) were themselves baked arrays. That is superseded: **every 2D/3D stock map is now source-backed and regenerates live** for any count (ADR-0008, and the *Source-backed stock maps* section of the Pixel Maps feature PRD). A stock map can never go stale — the user never edits it — so **baked replay applies only to custom maps**, where it exists to reproduce the hardware "changed pixelCount, forgot to re-save the Mapper" drift. The rest of this ADR is about custom maps and stands unchanged.

## Consequences

- Stock and custom maps share the `resolve(pixelCount)` interface but differ in body: stock **regenerates** live by running its plain-JS source (ADR-0008), custom **replays a frozen array** (baked). The render loop and `Preview` are agnostic to which kind they hold — no special-casing at the call site.
- A custom `MapRecord` stores the **baked point array** (what renders) and, for function-authored maps, also the **source** (so it stays re-editable). An imported point list has only the array, no source. This is source + compiled-output in one record, not geometry duplicated across patterns (patterns reference a map by `id`).
- A **stale affordance** is needed: when the active count no longer matches a baked custom map, surface a "re-save to regenerate" cue, mirroring the hardware Mapper-save step. (Tracked as the final Phase-2 increment.)
- `dim` is inferred from the baked coordinates' arity (`[x,y]` → 2D, `[x,y,z]` → 3D), matching how firmware reports `pixelMapDimensions()`; mixed arity is a save-time error.
