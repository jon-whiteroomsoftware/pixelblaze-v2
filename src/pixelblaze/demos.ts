import type { Settings } from '@/engine/settings'

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

// Recommended settings (IDE-side, preview-only) — cascade layer 2. One
// table keyed by curated-pattern (demo) name, consolidating the three former
// registries (recommended map / pixel count / solidity). A geometry-aware demo
// names the map / count / solidity it's meant to be seen on, so it opens looking its
// best without forcing anything: every value is just the on-open default ahead of
// the user global-sticky and dev-default, freely overridable from the controls, and
// never reaches pattern source, the transpiled artifact, or a controller. A demo has
// no PatternRecord, but it does carry its own persisted layer-1 override bag (keyed by
// demo name, in patternStore.demoOverrides), so a user's tweaks
// outrank these recommendations and survive a reopen; "Revert to recommended" clears
// that bag to fall back to this layer.
export const RECOMMENDED_SETTINGS: Record<string, Partial<Settings>> = {
  AuroraSphere: { mapId: 'seed-sphere-3d', pixelCount: 4096, solidity: 1 },
  NebulaSphere: { mapId: 'seed-sphere-3d', pixelCount: 8192, solidity: 1 },
  CorePulse3D: { mapId: 'seed-sphere-3d', pixelCount: 4096, solidity: 1 },
  CrystalLattice3D: { mapId: 'seed-cube-3d', pixelCount: 4096, solidity: 1 },
  GyroidGlow3D: { mapId: 'seed-cube-3d', pixelCount: 4096, solidity: 1 },
  HelixForge3D: { mapId: 'seed-sphere-3d', pixelCount: 4096, solidity: 1 },
  NebulaShells3D: { mapId: 'seed-sphere-3d', pixelCount: 4096, solidity: 1 },
  VoxelFireflies3D: { mapId: 'seed-cube-3d', pixelCount: 4096, solidity: 1 },
  // 1D "Living" demos: a ring closes the polyrhythm into a clock face and the
  // firefly coupling loop into a circle; a denser strip gives both room to breathe.
  PulseLoom: { shapeId: 'ring', pixelCount: 160, diffusion: 0.6 },
  FireflyChoir: { shapeId: 'ring', pixelCount: 200, diffusion: 0.55 },
  CometLoom: { shapeId: 'ring', pixelCount: 180, diffusion: 0.5 },
  MetroLines: { shapeId: 'ring', pixelCount: 180, diffusion: 0.45 },
  Trainyard: { shapeId: 'strip', pixelCount: 180, diffusion: 0.35 },
}

// The recommended settings for a demo (cascade layer 2), or an empty object for a
// demo without recommendations and for user patterns (which have no recommendation
// layer — dev-default + global-sticky + their own overrides only).
export function recommendedSettingsFor(demoName: string | null | undefined): Partial<Settings> {
  return (demoName ? RECOMMENDED_SETTINGS[demoName] : undefined) ?? {}
}
