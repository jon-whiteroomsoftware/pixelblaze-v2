# Preview light size and diffusion are preview-only viewport constructs with fixed invariants

**Status:** accepted

The preview has two cosmetic controls over how the light sources are *drawn* — **preview light size** and **diffusion**. An earlier control called "spacing" conflated several ideas (it was variously imagined as moving the dots apart, scaling the canvas, and scaling the dots), and diffusion had drifted into changing source size and brightness. This ADR fixes their meaning.

Both are **preview-only viewport constructs**: they describe how the IDE's visual renderer draws light, nothing about the physical installation. Neither is ever written into a **map** or sent to a **controller** — physical LED density is the map's concern, not these.

## Decision

**Preview light size** replaces the old "spacing" control.

- It sets the drawn diameter of each light source as **a fraction of the inter-dot pitch** (`diameter = pitch × f`), so "almost touching" lands at the same *felt* point in 1D/2D/3D regardless of pixel count or camera zoom.
- The slider sweeps **f: 0.15 → 0.95** (clearly separated → almost touching), **default 0.5**.
- It grows the sources **in place**: positions and the layout's extent never move (the line keeps its length; the plane/cube keep their bounds). In 3D the orb gains volume.
- The internal fit-to-container pixel **pitch** (`grid.spacing`) keeps its name and role — it positions the dots; light size only scales how large they're drawn.

**Diffusion** is a blur that merges the light sources, like a physical diffuser, with two hard invariants:

1. **It never changes light-source size** — that is light size's job alone.
2. **It never dims** — sweeping diffusion 0 → 100 at fixed brightness, the field never looks darker overall (energy-conserving; peaks may soften, gaps fill, but no net darkening). **Brightness is the only control that changes brightness.**

The two controls are **mutually independent**, and each must feel **uniform across 1D/2D/3D**. The literal mechanism may differ per display dimension (e.g. a CSS blur in 2D vs. a different approach on the sparse 3D lattice) — only the *feel* must match. We deliberately do **not** mandate one shared code path.

## Considered options

- **Keep "spacing" as a uniform camera scale that moves dots apart** (the original §5 framing) — rejected. Maps normalize each axis from the *counts*, so moving dots uniformly apart is invisible to the pattern and, after fit-to-container, visually a no-op on the layout's extent. The real desire was always "make the light sources bigger," not "move them apart."
- **Grow the dots to simulate 3D diffusion** (the shipped 1b behaviour, `DIFFUSION_3D_GROWTH`) — rejected. It violates invariant 1 (diffusion changing source size) and re-tangles the two controls that caused prior brightness/size confusion.
- **Make light size a per-map property** (physical density of the installation) — rejected for the preview control. Physical density belongs to the **map**/hardware model; this slider is a viewing-comfort pref only and must stay out of any data model that reaches a controller.
- **One shared diffusion code path across dimensions** — rejected as a requirement. The 2D grid is dense and the 3D lattice sparse; forcing identical mechanism is what drove the dimming/size cheats. Uniform *feel*, not uniform code.

## Consequences

- The UI "Spacing" slider becomes **"Light size"**; `previewStore.spacingScale` (and the renderer's `dotScale`) are renamed/redefined around `lightSize` with the 0.15–0.95 range and 0.5 default.
- **`diffusion` is hoisted out of `GridConfig`** to a sibling viewport pref alongside light size, so neither preview construct sits inside anything that could serialize toward a map or controller.
- The 3D path drops dot-growth-as-diffusion (`DIFFUSION_3D_GROWTH`) and instead consumes light size for source diameter and an energy-conserving blur for diffusion.
- A by-eye acceptance test is added: sweep diffusion 0 → 100 at fixed brightness in each dimension and confirm the field never looks darker overall.
- Closes the loop on the historical brightness-vs-diffusion bug (#75) and the preview-sizing confusion (#82); supersedes the "spacing" language in [ADR-0005](0005-display-position-dual-sourced.md) and the Pixel Maps feature PRD §5.
