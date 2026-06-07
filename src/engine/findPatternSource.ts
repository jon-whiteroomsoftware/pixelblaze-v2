import { DEMOS } from '@/pixelblaze/demos'
import type { PatternRecord } from '@/engine/storage'

// Resolve a pattern NAME to its source code, looking across the built-in demos and
// the user's saved patterns. Used to recover dims (and anything else source-derived)
// for a pattern we only know by name — e.g. whatever a Controller reports running.
// Demos win ties: a stock name maps to the stock source. Returns null when the name
// matches nothing we hold locally (an imported/foreign pattern on the device).
export function findPatternSource(
  name: string,
  userPatterns: PatternRecord[],
): string | null {
  if (DEMOS[name] !== undefined) return DEMOS[name]
  return userPatterns.find((p) => p.name === name)?.src ?? null
}
