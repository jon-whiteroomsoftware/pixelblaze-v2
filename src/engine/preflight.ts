// Pure preflight reconciliation for Send-to-Controller (issue #203, #213, #239). Only
// a *map* push reconciles a count here — a *pattern* push does not:
//
//   - **Pattern push** has NO count preflight (#239). It sends bytecode only; the
//     device runs it on its own pixels and its own map, so the device's pixel count is
//     the only count that matters. The IDE's *preview* resolution (a rendering choice —
//     e.g. a 64x64 preview grid) is unrelated to what the hardware drives, so comparing
//     it to the device count produced a misleading "maps 4096 pixels, extra ignored"
//     warning on essentially every push. Removed: a pattern push goes straight through.
//   - **Map push** is a *hard* failure on a count mismatch. The firmware silently
//     **drops** a map whose point count != pixelCount (confirmed against the device
//     and by the reference client, which refuses to even parse such a map on
//     read-back: `numElements != pixelCount → ValueError`, #204/#213). So a map count
//     mismatch is **blocking**, with a coupled remedy: set the Controller's pixel
//     count to the map's point count, then push — the only thing that makes a
//     fixed-count map apply. The caller offers that as one explicit action.
//
// Transport-agnostic and React-free: the caller supplies the two counts (device count
// read via getConfig; local count from the re-baked map) and whether a map upload is
// opted into.
//
// A *pattern* push DOES carry one preflight concern (the dim match): a pattern whose
// coordinate dimensionality differs from the Controller's installed map renders against
// coordinates that don't line up, so it will likely look wrong. Unlike the map-count
// mismatch this is NOT blocking — the device still runs it, and the author may know
// better (e.g. a 1D pattern that ignores y/z) — so it is a soft warning the author can
// push past, mirroring the existing "don't block when the map dim is unknown" stance.

/** Each distinct preflight concern. `map-overwrite` is the shared-map guard and
 *  `map-count-mismatch` the blocking map-push failure (firmware would silently drop the
 *  map) — both map-push only. `pattern-dim-mismatch` is the pattern-push soft warning:
 *  the pattern's dimensionality differs from the Controller's installed map. */
export type PreflightWarningKind =
  | 'map-overwrite'
  | 'map-count-mismatch'
  | 'pattern-dim-mismatch'

export interface PreflightWarning {
  kind: PreflightWarningKind
  /** Human-readable headline, ready to render in the reconciliation popover. */
  message: string
  /** Optional secondary explanation, shown behind an info-hover rather than inline so
   *  the popover body stays short (the map-count-mismatch firmware rule, #213). */
  detail?: string
}

export interface PreflightInput {
  /** The re-baked map's point count — what will actually be sent. Map push only. */
  localPixelCount?: number
  /** The Controller's configured pixel count (from getConfig), or null when it can't be
   *  read — in which case the mismatch check is suppressed (nothing to compare, and we
   *  can't safely block). */
  devicePixelCount?: number | null
  /** True when this Send uploads the IDE's map (overwriting the device's single shared
   *  map). Selects the map-push reconciliation; when false/omitted this reconciles a
   *  pattern push (the dim-match warning below) instead. */
  pushingMap?: boolean
  /** Pattern push only: the open pattern's coordinate dimensionality. */
  patternDim?: 1 | 2 | 3
  /** Pattern push only: the Controller's installed-map dimensionality, or null when it
   *  can't be read — in which case the dim warning is suppressed (can't prove a
   *  mismatch, same stance as the map count when the device count is unknown). */
  mapDim?: 1 | 2 | 3 | null
}

export interface Preflight {
  /** Ordered warnings: the fit / mismatch warning (if any) first, then map-overwrite. */
  warnings: PreflightWarning[]
  /** Whether a warning blocks the plain push. True only for a map-count mismatch — the
   *  caller must then offer the coupled set-pixel-count remedy instead of a plain push. */
  blocking: boolean
  /** When `blocking`, the pixel count the Controller must be set to for the map to
   *  apply (= the map's own point count). null otherwise. */
  remedyPixelCount: number | null
}

/** Reconcile the open pattern or map against the connected Controller. Returns the
 *  ordered warnings to show in the preflight dialog; an empty, non-blocking list means
 *  a clean push (the caller may then skip the dialog entirely). */
export function describePreflight({
  localPixelCount = 0,
  devicePixelCount = null,
  pushingMap = false,
  patternDim,
  mapDim = null,
}: PreflightInput): Preflight {
  const warnings: PreflightWarning[] = []

  if (pushingMap) {
    // Map push: a count mismatch is a HARD failure — firmware silently drops a map
    // whose point count differs from pixelCount. Block, and carry the count the
    // Controller must be set to (the map's own point count) for the coupled remedy.
    let blocking = false
    let remedyPixelCount: number | null = null
    if (devicePixelCount !== null && localPixelCount !== devicePixelCount) {
      warnings.push({
        kind: 'map-count-mismatch',
        message: `This map has ${localPixelCount} points but the Controller is set to ${devicePixelCount} pixels.`,
        detail:
          `The firmware silently drops a map whose point count doesn’t match, so it won’t apply ` +
          `until the Controller is set to ${localPixelCount} pixels.`,
      })
      blocking = true
      remedyPixelCount = localPixelCount
    }
    warnings.push({
      kind: 'map-overwrite',
      message: 'This replaces the Controller’s single shared map.',
    })
    return { warnings, blocking, remedyPixelCount }
  }

  // Pattern push: no count preflight (#239) — a pattern runs on the device's own pixels
  // and map, so the IDE's preview resolution is unrelated. The one concern is the dim
  // match: a pattern whose dimensionality differs from the installed map renders against
  // coordinates that don't line up. Soft (non-blocking) — the device still runs it and
  // the author may know better — and suppressed when the map dim is unknown.
  if (patternDim !== undefined && mapDim !== null && mapDim !== patternDim) {
    warnings.push({
      kind: 'pattern-dim-mismatch',
      message: `This pattern is ${patternDim}D but the Controller's map is ${mapDim}D.`,
      detail:
        `The device runs the pattern on its own installed map, so the coordinates won't ` +
        `line up — it will likely render incorrectly until a ${patternDim}D map is installed.`,
    })
  }
  return { warnings, blocking: false, remedyPixelCount: null }
}
