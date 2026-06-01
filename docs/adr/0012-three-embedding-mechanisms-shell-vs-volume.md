# Three embedding mechanisms; 3D maps are shell or volume; surface-cube and wireframe star retired

**Status:** accepted — refines [ADR-0010](0010-surfaces-are-2d-viewport-embeddings.md) (Surface family) and [ADR-0011](0011-solidity-preview-only-per-surface.md) (solid-eligibility); builds on [ADR-0005](0005-display-position-dual-sourced.md) (sample/position) and [ADR-0004](0004-pixelcount-independent-of-map.md).

ADR-0010 introduced the **Surface** as a 2D-map viewport embedding and listed "sphere, torus, polyhedron nets" as straightforward future Surfaces. ADR-0011 then split "cube" into a **surface cube** (an embedding, #167) and a **volumetric cube** (a 3D map), and made the **3D Sphere stock map** solid-eligible via a `solidEligible` flag + `normalize(pos − centroid)`. Working through the catalogue revealed those framings conflated two different things — *how `pos` is produced* (mechanism) and *what the geometry is* (shell vs volume) — and that several proposed Surfaces cannot exist cleanly. This ADR sorts them out.

## The distinction that was missing

A shape's **distribution is not a free property bolted onto an embedding — it falls out of the source map's arity**:

- A **2D map** (`sample = [u,v]`) carries a flat field with no interior, so wrapping it into 3D can only ever produce a **shell**, and only onto a **developable** form (one that unrolls to a plane without distortion).
- A **3D map** (`sample = [x,y,z]`) owns its geometry directly; that geometry may be a **shell** (points on a boundary), a **volume** (points filling the interior), or neither (a wireframe / irregular cloud).

So "surface vs cloud" was never one binary. There are **three mechanisms**.

## Decision

**There are three embedding mechanisms, selected by source-map arity, and a 3D map's geometry is named `shell` or `volume`.**

1. **Surface embedding** — a **2D map** wrapped onto a **developable** 3D form in the viewport (owns `pos`, serves a 2D pattern; ADR-0010). Members: **Flat** (identity) and **Cylinder** (a tube unrolls to the exact map rectangle). **Only developable forms qualify.** A sphere cannot (any wrap needs a projection with pole singularities and area distortion). A cube *net* is developable in principle but accepts **only square-per-face grids** — an arbitrary `cols×rows` map does not tile a cube net the way it wraps a cylinder — so the cube is **not** offered as a Surface either. The Surface family is therefore **Flat + Cylinder only**.

2. **3D shell map** — a **3D map** whose points lie on a boundary (`xyz`, hardware-real, serves a 3D pattern). The "shell-ness" is a property of the geometry the formula emits, not of a viewport wrap. **Solid-eligible**: it supplies a per-point outward normal — analytic where the generator knows it (face normals for a cube/star shell), or generic `normalize(pos − centroid)` for a convex shell (sphere), gated by the catalogue's `solidEligible` flag (ADR-0011).

3. **3D volume map** — a **3D map** with points through the interior (`xyz`). **Never solid-eligible** (no per-point boundary normal); it relies on the renderer's existing depth-tested opaque cores.

- **Catalogue naming convention.** A 3D map that comes in both forms is suffixed: **"… (shell)"** and **"… (volume)"**. The words are chosen to avoid collisions: **"cloud"** is reserved for *irregular measured* sets (a tree scan, a helix — no shell/volume duality), and **"solid"** is never used for a distribution because it collides head-on with the **Solidity** slider. A **wireframe** (points along edges) is its own irregular kind, not part of the duality.

- **Solid-eligibility spans mechanisms, defined by the presence of a normal.** ADR-0011's "solidity is a property of *surfaces* only" generalizes to "of any embedding **or 3D map** that supplies a surface normal." Eligible: the Cylinder surface, and every **shell map**. Ineligible: Flat, every **volume map**, wireframes, and irregular clouds. The terminator-fade mechanism in `project3D` is unchanged.

- **surface-cube (#167/#168) is retired.** It was a Surface embedding that *count-distributed* pixels across six faces while ignoring the composed map's grid — neither a faithful 2D wrap nor a clean 3D shell. Its role (a faceted solid-eligible exemplar) passes to the new **Cube (shell)** 3D map, which carries the same per-face normals as honest map geometry.

- **The wireframe Star map is retired**, replaced by **Star (shell)** and **Star (volume)**, bringing star into the same `shell`/`volume` scheme as cube and sphere. (A deliberate "wireframe" category may return later as its own kind; it is not the default.)

## Considered options

- **Keep "surface vs cloud" as one binary on the embedding.** Rejected: it hides that distribution is fixed by map arity and that a developable wrap, a shell map, and a volume map are three different mechanisms with different eligibility.
- **Offer a Cube (and Sphere) Surface embedding** (ADR-0010's "polyhedron nets / sphere are Surfaces"). Rejected: the sphere needs a distortive projection, and the cube net accepts only square-per-face grids — neither matches the cylinder's any-aspect clean unroll, so neither earns a place beside Flat/Cylinder.
- **Keep surface-cube as-is and add the new maps alongside.** Rejected: it doesn't faithfully wrap its map (reads as garbage) and would leave two near-identical "cube on its surface" concepts in different controls.
- **Reuse "cloud" for filled volumes.** Rejected: "cloud" already means an irregular measured set across CONTEXT.md; overloading it onto "filled volume" collides.

## Consequences

- **Catalogue (`stockCatalogue.ts`).** `seed-sphere-3d` "Sphere (cloud)" → **"Sphere (shell)"**; `cube` "Cube" → **"Cube (volume)"**. New entries: **"Cube (shell)"**, **"Sphere (volume)"**, **"Star (shell)"**, **"Star (volume)"**. The wireframe `star` entry is removed. Every shell entry carries `solidEligible: true`; volume entries do not.
- **Surfaces (`surfaces.ts`).** `SURFACE_CUBE` and the `'surface-cube'` `SurfaceId` are removed; the family is `flat | cylinder`. The per-face geometry/normal helpers move to the Cube (shell) map generator.
- **Normals (`centroidNormals.ts`).** Shell maps drive solidity: sphere via centroid normals (already), cube/star via per-face normals derived from the generator. The renderer's terminator fade is unchanged.
- **Persistence / migration.** A `PatternRecord` whose `surfaceId === 'surface-cube'`, or whose map points at the old `star` id, must be migrated to a sensible default (schemaless record, no `DB_VERSION` bump). Demos referencing the retired ids update their recommended-map entries.
- **ADR-0010** Surface family is corrected to **Flat + Cylinder**; the "sphere/torus/polyhedron-net Surfaces" line is superseded by this ADR. **ADR-0011** "surfaces only" is generalized to "any normal-bearing embedding or shell map," and the surface-cube exemplar is replaced by Cube (shell).
- **Glossary (`CONTEXT.md`).** **Surface** narrows to developable wraps; a **shell / volume** entry is added for 3D-map geometry; **Solidity** and **Surface normal** generalize to shell maps; "cloud" is pinned to irregular measured sets.
