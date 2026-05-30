# Display position is dual-sourced: map-intrinsic geometry vs. viewport shape embedding

**Status:** accepted

A map point's drawn position (`pos`) does not come from a single place. **`sample`** — the coordinates fed to the render fn — is always owned by the **map**. **`pos`** — where the dot is drawn — is **dual-sourced**:

- **Map-intrinsic** when the map encodes real geometry the pattern is meant to project onto: a grid, a volumetric cube, a Phase-2 measured installation. Here `pos` is a genuine property of the thing, not a display choice.
- **Viewport-supplied** when the pattern leaves position free — a 1D `render()` pattern, whose `sample` is empty. Line, ring, polygon, helix are all the *same* index sequence with the *same* (empty) `sample`; they differ only in where the dots are drawn. So the choice of shape is a **viewport** concern (a "shape embedding"), not different map content.

The rule that decides the source is exactly the §5 cosmetic-vs-semantic line: a shape is cosmetic (→ viewport) when the pattern can't observe it (`sample` unchanged), and semantic (→ map) when it defines `sample`.

## Considered options

- **`pos` is an unconditional field on every map point** (rejected — the original PRD §3 framing). Simpler: one field, one owner, line/ring are just stock maps. But it puts a pure display choice (which path to draw a strip along) inside the map object, so "the same 1D pattern drawn as a line vs. a ring vs. a helix" becomes three different *maps* despite identical pattern input. That conflates the viewport (how pixels are drawn) with the map (where the installation's pixels physically are), and it gives a future reader no principled place to draw the line when 2D/3D embeddings of 1D patterns arrive.

## Consequences

- **1D path shapes (line, ring, polygon, helix/spiral) are viewport shape-embeddings, not stock maps.** They live in a viewport embedding module, not `src/engine/maps/`. The committed stock-map set narrows to the genuinely geometric ones (plane, cube); 1D "maps" degenerate to ordering + empty `sample`, with `pos` supplied by the viewport.
- **The render pipeline reads `pos` from whichever source applies:** `index → map.sample` feeds the pattern; `index → (map.pos ?? viewport.shape(index))` feeds the camera.
- **The UI blurs the line on purpose:** a single "Shape" dropdown spans cosmetic 1D shapes and semantic 2D/3D maps. The clean distinction lives in the code, not the screen.
- **A shape's display dimension may exceed the pattern's** (a 1D pattern on a helix displays in 3D). The viewport's control set (locked-2D vs. orbit) is therefore gated on the *display* dimension, and the shape dropdown is filtered by *sample-arity* (pattern compatibility), not by the pattern's native dimensionality.
- **The 1D shape persists per-pattern** on `PatternRecord` alongside `mapId` (no `DB_VERSION` bump — schemaless record), so a strip wrapped into a helix reopens as that helix. Spacing/diffusion stay global viewing-comfort prefs; camera angle is ephemeral.
- Sibling to [ADR-0004](0004-pixelcount-independent-of-map.md): both keep the map narrow (an index→`sample` lookup that does not also own pixel count, and does not always own `pos`).
