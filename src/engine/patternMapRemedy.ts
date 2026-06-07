// The remedy offered alongside a pattern-push dim-mismatch warning (Option A): a demo
// that carries a recommended map can offer to install it on the Controller so the device
// map's dimensionality matches the pattern's. Pure + React-free: it resolves the demo's
// recommendation against the stock catalogue and reports what the coupled push would do.
//
// Scoped to DEMOS (issue follow-up): only curated demos carry a recommendation
// (RECOMMENDED_SETTINGS, keyed by demo name). User patterns have no recommendation layer,
// so the remedy is absent for them and the popover falls back to a plain "Send anyway".

import { recommendedSettingsFor } from '@/pixelblaze/demos'
import { stockMapSpec } from '@/engine/maps/stockCatalogue'

export interface RecommendedMapRemedy {
  /** The stock map id to install (e.g. `seed-sphere-3d`). */
  mapId: string
  /** Its human name, for the checkbox label (e.g. "Sphere shell"). */
  mapName: string
  /** Its coordinate dimensionality — equal to the pattern's, by construction. */
  mapDim: 1 | 2 | 3
}

/** The recommended-map remedy for a demo whose dimensionality mismatches the Controller's
 *  installed map, or null when there is none to offer. Present only when:
 *   - the open pattern is a demo carrying a recommended `mapId`,
 *   - that id resolves to a stock map, and
 *   - the stock map's dimension equals the pattern's (so installing it actually resolves
 *     the mismatch).
 *
 *  Note the recommendation's `pixelCount` is deliberately ignored: it's a *preview* size,
 *  unrelated to how many LEDs the hardware drives. The stock map is parametric, so the
 *  install materializes it to the *device's* current pixel count (see installStockMap /
 *  pushActiveMap) rather than changing the hardware count. */
export function recommendedMapRemedy(
  demoName: string | null | undefined,
  patternDim: 1 | 2 | 3,
): RecommendedMapRemedy | null {
  const rec = recommendedSettingsFor(demoName)
  if (!rec.mapId) return null
  const spec = stockMapSpec(rec.mapId)
  if (!spec || spec.dim !== patternDim) return null
  return { mapId: spec.id, mapName: spec.name, mapDim: spec.dim }
}
