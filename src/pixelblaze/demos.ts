const rawDemos = import.meta.glob('./demos/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const DEMOS: Record<string, string> = Object.fromEntries(
  Object.entries(rawDemos).map(([path, src]) => {
    const name = path.replace('./demos/', '').replace('.js', '')
    return [name, src as string]
  }),
)

// Recommended maps (IDE-side, preview-only). A geometry-aware demo points at the
// stock map it's meant to be seen on, so opening it lands on that map instead of
// the bare first dim-matched default. This is purely a preview convenience: it
// must never reach pattern source or the transpiled artifact — the physical
// Pixelblaze knows only patterns and maps. The map stays freely switchable; this
// only sets the on-open default (see resolveLayoutSelection).
export const DEMO_RECOMMENDED_MAPS: Record<string, string> = {
  AuroraSphere: 'seed-sphere-3d',
  NebulaSphere: 'seed-sphere-3d',
}

// The map a demo recommends opening on, or undefined for demos without one (and
// for user patterns, which carry their own persisted layout).
export function recommendedMapFor(demoName: string | null | undefined): string | undefined {
  return demoName ? DEMO_RECOMMENDED_MAPS[demoName] : undefined
}

// Recommended pixel counts (IDE-side, preview-only) — the same category as the
// recommended map above. A geometry-aware demo whose look needs a denser cloud
// than the bare per-dimension default (3D → the 8³ cube's 512) names the count it
// wants to open at, since a demo carries no persisted PatternRecord to remember
// one. Preview-only: it sets the on-open default ahead of the dim default, never
// reaches the artifact, and leaves the count box freely editable.
export const DEMO_RECOMMENDED_PIXEL_COUNTS: Record<string, number> = {
  AuroraSphere: 4096,
  NebulaSphere: 8192,
}

// The pixel count a demo recommends opening at, or undefined for demos without one.
export function recommendedPixelCountFor(demoName: string | null | undefined): number | undefined {
  return demoName ? DEMO_RECOMMENDED_PIXEL_COUNTS[demoName] : undefined
}

// Recommended solidity (IDE-side, preview-only) — the same registry family as the
// recommended map and count above (ADR-0011). A solid-object demo opens at this
// value ahead of the global 1.0 default, so AuroraSphere / NebulaSphere land as
// solid spheres that hide their own back hemisphere. A demo carries no persisted
// solidity, so the slider stays freely editable; the value never reaches the
// pattern source, the transpiled artifact, or a controller.
export const DEMO_RECOMMENDED_SOLIDITIES: Record<string, number> = {
  AuroraSphere: 1,
  NebulaSphere: 1,
}

// The solidity a demo recommends opening at, or undefined for demos without one
// (and for user patterns, which carry their own persisted solidity).
export function recommendedSolidityFor(demoName: string | null | undefined): number | undefined {
  return demoName ? DEMO_RECOMMENDED_SOLIDITIES[demoName] : undefined
}
