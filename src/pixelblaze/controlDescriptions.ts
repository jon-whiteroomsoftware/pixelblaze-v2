import type { PatternMetadata } from '@/engine/loadPattern'

type Controls = PatternMetadata['controls']

// Curated, end-user-facing descriptions for demo controls (issue #190).
//
// Keyed by demo name -> control exportName -> one short sentence. Authored once
// from each demo's own comments + code, reworded for a user twisting the knob
// (the in-code comments are a mix of user help and dev rationale, so they're a
// guide only). This table is the single source for the help hover (#189) and is
// kept in sync with the demos by controlDescriptions.test.ts, which fails the
// build if a demo gains/renames/removes a control without a matching entry.
//
// Not parsed from the demo source at runtime: the expensive judgement happens
// here, once. User/imported patterns have no entry and fall back to the
// humanized control label.
export const CONTROL_DESCRIPTIONS: Record<string, Record<string, string>> = {
  AuroraSphere: {
    sliderRingCount: 'Number of glowing latitude rings wrapped around the sphere.',
    sliderSpin: 'How fast the bright great-ring orbits — centred is still, higher spins faster.',
    sliderSpeed: 'How often the rings ratchet up a level — the tick rate of the bloom.',
  },
  Caustics: {
    sliderSpeed: 'How fast the water moves.',
    sliderDensity: 'Size of the light pools — higher packs in more, smaller cells.',
    sliderSharpness: 'Focus of the light: soft glowing pools at low, crisp bright veins at high.',
    sliderTint: 'Base water colour, swept around the colour wheel.',
  },
  ControlsShowcase: {
    sliderSpeed: 'How fast the shapes orbit.',
    sliderEdgeBlur: "Softness of the shapes' edges — sharp at low, glowing at high.",
    sliderOrbitDist: 'How far the shapes swing out from the centre.',
    toggleStarMode: 'Switch the orbiting shapes between circles and stars.',
    hsvPickerColor: 'Base colour of the shapes.',
  },
  FireflyChoir: {
    sliderCoupling:
      'How strongly the fireflies pull each other into sync — low stays in chaos, high snaps to a unified pulse.',
    sliderTempo: 'Base flashing rate of the fireflies.',
    sliderSpread: "Variety in each firefly's natural rhythm — keeps the sync alive instead of freezing.",
    sliderColor: 'Base colour of the fireflies.',
    sliderVariance: 'Per-firefly colour jitter — low makes them identical, high scatters their tints.',
  },
  IQPalettes: {
    sliderSpeed: 'How fast the palette parameter scrolls across the bands.',
  },
  KaleidoBloom: {
    sliderSpeed: 'How fast the lattice spins and breathes.',
    sliderZoom: 'Size of the lattice cells.',
    sliderBreathe: 'How much the zoom pulses in and out.',
    sliderColorSpread: 'Width of the radial rainbow spreading from the centre.',
  },
  Kishimisu: {
    rgbPickerPaletteA: 'Palette base colour — the midpoint the gradient cycles around.',
    rgbPickerPaletteB: 'Palette contrast — how far the colours swing from the base.',
    rgbPickerPaletteD: 'Palette phase — shifts where each colour lands in the cycle.',
    sliderZoom: 'Scale of the folded kaleidoscope pattern.',
    sliderRingDensity: 'How many sine rings pack into each fold.',
    sliderGlow: 'Brightness and bloom of the bright veins.',
    sliderSharpness: 'How tight and crisp the rings are.',
    sliderOctaves: 'How many layers of folded detail are stacked.',
  },
  NebulaSphere: {
    sliderSpeed: 'How fast the gas drifts through the volume.',
    sliderZoom: 'Detail scale — higher is finer and busier.',
    sliderWarp: 'How violently the gas folds in on itself.',
    sliderTwinkle: 'Density of stars in the dark voids.',
  },
  PhantomStar: {
    sliderSpeed: 'Animation rate of the fractal.',
    sliderQuality: 'Detail of the raymarch — higher looks sharper but costs more.',
    sliderDepth: 'How many times the fractal folds in on itself.',
    sliderGain: 'Overall glow brightness.',
  },
  PlasmaNebula: {
    sliderSpeed: 'How fast the gas drifts.',
    sliderZoom: 'Detail scale — higher is finer and busier.',
    sliderWarp: 'How violently the gas folds in on itself.',
    sliderTwinkle: 'Density of stars in the dark voids.',
  },
  PulseLoom: {
    sliderTempo: 'Speed of the groove, in bars per second.',
    sliderSwing: 'Swing feel — straight at low, a heavy lilt at high.',
    sliderWidth: "Width of each drum strike's glow.",
    sliderPalette: 'Spins the four-colour complementary palette around the wheel.',
    toggleAccent: 'Flash the whole strip on the downbeat when every voice lands together.',
  },
  ShaderShowcase: {
    sliderSpeed: 'Animation rate.',
    sliderZoom: 'Density of the kaleidoscope.',
  },
  ZippyZaps: {
    sliderIterations: 'How many fold passes build the arcs — more adds detail but costs more.',
  },
}

// Return a copy of `controls` with `description` filled in from the curated
// table for `demoName`. Pure and total: an unknown/null demo, or a control with
// no curated entry, is returned unchanged (UI falls back to the label).
export function withControlDescriptions(
  demoName: string | null | undefined,
  controls: Controls,
): Controls {
  const table = demoName ? CONTROL_DESCRIPTIONS[demoName] : undefined
  if (!table) return controls
  return controls.map((c) => {
    const description = table[c.exportName]
    return description ? { ...c, description } : c
  })
}
