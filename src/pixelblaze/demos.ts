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
  // Curated launch defaults: keep demo counts plausible for a real Pixelblaze
  // preview (256-2048), use a bright but not clipped baseline, and vary maps /
  // embeddings so the catalogue shows the preview system's range at first open.
  AuroraSphere: { mapId: 'seed-sphere-3d', pixelCount: 2048, brightness: 0.9, diffusion: 0.34, solidity: 1 },
  NebulaSphere: { mapId: 'sphere-volume', pixelCount: 2048, brightness: 0.9, diffusion: 0.48, solidity: 1 },
  CorePulse3D: { mapId: 'sphere-volume', pixelCount: 1536, brightness: 0.9, diffusion: 0.42, solidity: 1 },
  CrystalLattice3D: { mapId: 'seed-cube-3d', pixelCount: 1728, brightness: 0.9, diffusion: 0.44, solidity: 1 },
  CrystalRain3D: { mapId: 'seed-cube-3d', pixelCount: 1728, brightness: 0.9, diffusion: 0.40, solidity: 1 },
  GyroidGlow3D: { mapId: 'star-volume', pixelCount: 1536, brightness: 0.9, diffusion: 0.44, solidity: 1 },
  HelixForge3D: { mapId: 'tetra-volume', pixelCount: 1536, brightness: 0.9, diffusion: 0.34, solidity: 1 },
  LatticeWarp3D: { mapId: 'seed-cube-3d', pixelCount: 1728, brightness: 0.9, diffusion: 0.30, solidity: 1 },
  NebulaShells3D: { mapId: 'seed-sphere-3d', pixelCount: 2048, brightness: 0.9, diffusion: 0.36, solidity: 0.9 },
  VoxelFireflies3D: { mapId: 'star-shell', pixelCount: 1536, brightness: 0.9, diffusion: 0.46, solidity: 0.78 },

  CometLoom: { shapeId: 'pole', pixelCount: 384, brightness: 0.9, lightSize: 0.68, diffusion: 0.42, solidity: 0.72 },
  FireflyChoir: { shapeId: 'ring', pixelCount: 320, brightness: 0.9, lightSize: 0.76, diffusion: 0.48 },
  MetroLines: { shapeId: 'ring', pixelCount: 320, brightness: 0.9, lightSize: 0.72, diffusion: 0.38 },
  PulseLoom: { shapeId: 'ring', pixelCount: 256, brightness: 0.9, lightSize: 0.78, diffusion: 0.62 },

  BubbleGlass: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.44 },
  Caustics: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1536, brightness: 0.9, diffusion: 0.32 },
  CompassRose: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.30 },
  EasedSweep: { mapId: 'wide', surfaceId: 'flat', pixelCount: 512, brightness: 0.9, diffusion: 0.38 },
  HeatShimmerTiles: { mapId: 'wide', surfaceId: 'cylinder', pixelCount: 1536, brightness: 0.9, diffusion: 0.36, solidity: 0.76 },
  IQPalettes: { mapId: 'wide', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.28 },
  KaleidoBloom: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.24 },
  Kishimisu: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1536, brightness: 0.9, diffusion: 0.28 },
  MagneticFilaments: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.26 },
  MetaballGarden: { mapId: 'plane', surfaceId: 'flat', pixelCount: 768, brightness: 0.9, diffusion: 0.42 },
  MoireCathedral: { mapId: 'panel-winding', surfaceId: 'cylinder', pixelCount: 1024, brightness: 0.9, diffusion: 0.30, solidity: 0.7 },
  NeonCircuitBoard: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1536, brightness: 0.9, diffusion: 0.22 },
  NeonSquircles: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.24 },
  OrigamiLanterns: { mapId: 'plane', surfaceId: 'flat', pixelCount: 768, brightness: 0.9, diffusion: 0.44 },
  PhantomStar: { mapId: 'plane', surfaceId: 'flat', pixelCount: 768, brightness: 0.9, diffusion: 0.20 },
  PlasmaNebula: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1536, brightness: 0.9, diffusion: 0.48 },
  RibbonLoom: { mapId: 'wide', surfaceId: 'cylinder', pixelCount: 1536, brightness: 0.9, diffusion: 0.36, solidity: 0.78 },
  ShaderShowcase: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.26 },
  SignalMandala: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.30 },
  StainedGlassWeather: { mapId: 'plane', surfaceId: 'cylinder', pixelCount: 1024, brightness: 0.9, diffusion: 0.34, solidity: 0.82 },
  TopographicBloom: { mapId: 'plane', surfaceId: 'flat', pixelCount: 768, brightness: 0.9, diffusion: 0.34 },
  ZippyZaps: { mapId: 'plane', surfaceId: 'flat', pixelCount: 256, brightness: 0.9, diffusion: 0.36 },

  TestPattern1D: { shapeId: 'line', pixelCount: 256, brightness: 0.9, lightSize: 0.68, diffusion: 0.24 },
  TestPattern2D: { mapId: 'plane', surfaceId: 'flat', pixelCount: 1024, brightness: 0.9, diffusion: 0.28 },
  TestPattern3D: { mapId: 'seed-cube-3d', pixelCount: 512, brightness: 0.9, diffusion: 0.30, solidity: 1 },
}

// The recommended settings for a demo (cascade layer 2), or an empty object for a
// demo without recommendations and for user patterns (which have no recommendation
// layer — dev-default + global-sticky + their own overrides only).
export function recommendedSettingsFor(demoName: string | null | undefined): Partial<Settings> {
  return (demoName ? RECOMMENDED_SETTINGS[demoName] : undefined) ?? {}
}
