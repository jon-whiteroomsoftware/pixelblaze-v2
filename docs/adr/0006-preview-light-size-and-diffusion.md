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

**Diffusion** merges the light sources like a physical diffuser, with two hard invariants:

1. **It never changes light-source size** — that is light size's job alone.
2. **It never dims** — sweeping diffusion 0 → 100 at fixed brightness, the field never looks darker overall (peaks may soften, gaps fill, but no net darkening). **Brightness is the only control that changes brightness.**

The two controls are **mutually independent**, and each must feel **uniform across 1D/2D/3D**.

**Diffusion is modelled as a per-source point-spread, not a blur of the rendered frame.** Diffusion grows a soft radial profile around each source which overlaps neighbours and fills the inter-source gaps — exactly what a diffuser sheet does. This was a deliberate revision: the first implementation was a whole-frame Gaussian (an SVG `feGaussianBlur` over the canvas in linear light). A frame blur is a low-pass filter, and it failed the *feel* test even while honouring the two invariants — it drained the bright cores, bled light past the array edge as a "furry" halo, and in 3D smeared the orbiting silhouette. It read as fog, not diffusion. The per-source kernel never paints outside a source's own footprint, so none of those artifacts arise.

**At full diffusion the source's solid core dissolves so the field fully merges.** A second revision corrected the per-source kernel's first cut, which had kept each core *crisp and at full intensity for all diffusion levels*. That honoured "never dims" but meant the solid bright disc — the visible pixel — was always present, so 100% never read as "fully merged": individual sources stayed visible on the 2D plane, the 3D cylinder, and especially the 3D cube. The fix lets the solid core **dissolve as diffusion → 1** (its full-intensity radius shrinks to nothing) so the whole source becomes one smooth raised-cosine (Hann) bump that fuses gap-free with its neighbours. This is consistent with invariant 1 read as governing *light size* (the source's drawn footprint at rest), not forbidding the diffusion profile from spreading energy at the top of the slider.

Non-dimming (invariant 2) is preserved by **pinning the brightest point** rather than the whole core: each source's peak amplitude is normalised by how much neighbouring tails pile onto a source centre (`peak = 1 / centre-overlap`). With no overlap (diffusion 0) peak is 1 and the draw is unchanged; as the tails widen, peak eases down just enough that the brightest point holds ≈ the original core brightness while the formerly-dark gaps rise to meet it. The brightest feature never darkens and the field never blows out — gaps only fill upward.

The kernel lives in the WebGL fragment shader (a Hann radial falloff keyed off `gl_PointCoord`), so it is **one shared code path** across 1D/2D/3D — the per-dimension blur factors the frame-blur approach needed are gone. The only per-dimension difference is compositing: 2D/1D is a single additive layer (core + tail in one pass); 3D draws opaque depth-tested cores first (so nearer orbs occlude farther — crisp at low diffusion, never a washed-out additive haze) then an additive tail pass that only *adds* glow into the dark gaps. As diffusion rises the opaque core shrinks toward zero, so the 3D cube cross-fades from crisp orbs into one smooth volumetric glow — and the field never dims.

## Considered options

- **Keep "spacing" as a uniform camera scale that moves dots apart** (the original §5 framing) — rejected. Maps normalize each axis from the *counts*, so moving dots uniformly apart is invisible to the pattern and, after fit-to-container, visually a no-op on the layout's extent. The real desire was always "make the light sources bigger," not "move them apart."
- **Grow the dots to simulate 3D diffusion** (the shipped 1b behaviour, `DIFFUSION_3D_GROWTH`) — rejected. It violates invariant 1 (diffusion changing source size) and re-tangles the two controls that caused prior brightness/size confusion.
- **Make light size a per-map property** (physical density of the installation) — rejected for the preview control. Physical density belongs to the **map**/hardware model; this slider is a viewing-comfort pref only and must stay out of any data model that reaches a controller.
- **One shared diffusion code path across dimensions** — originally rejected as a *requirement* (uniform *feel*, not uniform code), but the per-source kernel happens to deliver it anyway: the same fragment-shader falloff serves all dimensions, with only the compositing pass differing.
- **A whole-frame Gaussian blur** (the first shipped diffusion, an SVG `feGaussianBlur` in linear light) — rejected on revision. Energy-conserving and non-dimming, but as a low-pass filter it drained bright cores, bled a furry halo past the array edge, and smeared the 3D silhouette: it read as a blur, not a diffuser. Superseded by the per-source glow.

## Consequences

- The UI "Spacing" slider becomes **"Light size"**; `previewStore.spacingScale` (and the renderer's `dotScale`) are renamed/redefined around `lightSize` with the 0.15–0.95 range and 0.5 default.
- **`diffusion` is hoisted out of `GridConfig`** to a sibling viewport pref alongside light size, so neither preview construct sits inside anything that could serialize toward a map or controller.
- The 3D path drops dot-growth-as-diffusion (`DIFFUSION_3D_GROWTH`) and instead consumes light size for source diameter and the per-source glow kernel for diffusion.
- Diffusion is owned by the WebGL renderer (`setDiffusion`), driven by `diffusionGlow(diffusion, coreDiameterPx, pitchPx)` in `camera.ts`, which returns the grown quad size, the (dissolving) solid-core fraction `coreFrac`, and the overlap-normalised `peak` amplitude. The old SVG `feGaussianBlur` filter and the `diffusionBlurStdDev` / per-dimension `DIFFUSION_BLUR_PITCH_FACTOR_*` helpers are removed.
- A by-eye acceptance test is added: sweep diffusion 0 → 100 at fixed brightness in each dimension and confirm the field never looks darker overall.
- Closes the loop on the historical brightness-vs-diffusion bug (#75) and the preview-sizing confusion (#82); supersedes the "spacing" language in [ADR-0005](0005-display-position-dual-sourced.md) and the Pixel Maps feature PRD §5.

## Later refinement

[ADR-0013](0013-per-pattern-settings-cascade.md) reclassifies light size and diffusion as **hybrid** fields of the per-pattern settings cascade: a user **global-sticky** baseline (set once, applies everywhere) that a curated pattern may recommend and the user may override per-pattern. Their invariants here are unchanged — only how their value is sourced and stored.
