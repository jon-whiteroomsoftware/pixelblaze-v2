# Per-pattern settings cascade

**Status:** accepted (supersedes the "global, not per-pattern" rule for viewing-comfort prefs in [ADR-0006](0006-preview-light-size-and-diffusion.md) and the corresponding CONTEXT.md language)

A pattern shows off badly when opened with the wrong map, too few pixels, or the wrong viewport settings. We want curated patterns (demos) to open looking their best without forcing a setting on anyone, and we want a user's own adjustments honoured once they've dialled a pattern in for their specific hardware. The earlier rule that viewing-comfort prefs (brightness, light size, diffusion) are a single *global* value, never per-pattern, blocked both goals and is hereby overturned.

## Decision

The effective value of every tunable preview setting is resolved through a **four-layer cascade**, first hit wins, top-down:

1. **Per-pattern override** — written sparsely (`Partial<Settings>`), *only* when the user genuinely manipulates that control.
2. **Recommended** — a per-pattern table the IDE author ships, attached only to curated patterns (demos). Consolidates the three existing registries (recommended map / count / solidity) into one recommended-settings object.
3. **User global-sticky** — a single persisted value the user sets once; applies only to the *comfort-pref* fields (see partition).
4. **Developer default** — a static table shipped in the engine.

`effective = override[id] ?? recommended[id] ?? globalSticky ?? devDefault` per field.

### Field partition

- **Per-pattern cascaded** (layers 1, 2, 4 — no global-sticky): `mapId`, `shapeId`/`surfaceId`, `pixelCount`, `solidity`, `normalize`, `brightness`, `speed`. Dragging the control writes a sparse layer-1 override on the active pattern only.
- **Hybrid comfort prefs** (all four layers): `lightSize`, `diffusion`. Recommendable and per-pattern overridable, but their baseline is a user global-sticky value. Drag on a pattern with no recommendation and no existing override writes the global-sticky (set-once-stays-set); otherwise drag writes a per-pattern override (which outranks the recommendation, so a user can still override an enforced look).
- **Pure global** (layer 3 only, never cascaded): `fidelity`. The renderer is a machine/performance choice — never recommended, never per-pattern.

### Other rules

- **Dirty detection is per-field and manipulation-gated.** An override is written from the control's own change handler when the user moves it — never inferred by comparing a stored value to a default (a stored value equal to the default is indistinguishable from "untouched", so equality can't drive dirtiness).
- **Forking a demo snapshots its *effective* settings** into the new `PatternRecord` as explicit layer-1 overrides — a frozen copy. The fork carries no live pointer back to the demo; later changes to the demo's recommendations do not reach the fork.
- **Reset to defaults** is a per-pattern action that clears that pattern's layer-1 overrides, dropping it back to recommended + global + dev-default. (Per-field reset and an overridden-vs-inherited visual tell are possible later additions the sparse model already supports; not built now.)
- A user's own pattern has no recommendation layer — it is dev-default + global-sticky + their overrides.

## Considered options

- **Snapshot all effective settings onto the record on first touch** — rejected. It freezes the recommendation wholesale, so an improved recommended map never reaches a pattern the user barely touched. Sparse per-field overrides keep untouched fields flowing from the lower layers.
- **Keep comfort prefs purely global (the ADR-0006 rule)** — rejected. It cannot express "this plasma demo needs heavy diffusion or it looks like garbage", which is the whole point.
- **Comfort prefs global-sticky but user touch permanently outranks recommendations** — rejected. A demo could then never enforce its look against a user who fiddles. We instead let a per-pattern override outrank the recommendation, preserving both enforce-on-open and user-can-override.
- **Fork keeps a live `sourceDemo` pointer** — rejected. A fork is "make it mine as it looks now"; a copy that silently mutates when the original demo changes is surprising, and it couples user records to demo identity (dangling on rename/remove).

## Consequences

- `previewStore`'s global localStorage persistence of `brightness`/`speed`/`lightSize`/`diffusion` is retired. `brightness`/`speed` become per-pattern cascaded fields; `lightSize`/`diffusion` become hybrid (global-sticky baseline + per-pattern override); only `fidelity` (plus the global-sticky `lightSize`/`diffusion` baselines) remains globally persisted.
- The three registries (`recommended map`, `recommended pixel count`, `recommended solidity`) collapse into one `recommended settings` table keyed by curated-pattern id.
- `PatternRecord` gains a sparse settings-override field covering the per-pattern cascaded set (extending today's `mapId`/`shapeId`/`surfaceId`/`pixelCount`/`solidity`/`normalize`).
- A pure resolver (`resolveSettings(id, overrides, recommended, globalSticky, devDefaults)`) becomes the single seam the preview reads effective settings from — engine-pure, table-testable.
- Supersedes the "viewing-comfort pref, persisted globally, not per-pattern" language in [ADR-0006](0006-preview-light-size-and-diffusion.md) and in the CONTEXT.md **Preview light size** / **Diffusion** entries.
