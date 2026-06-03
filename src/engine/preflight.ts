// Pure preflight reconciliation for Send-to-Controller (H11, issue #203). Before a
// push the IDE compares the open pattern's modeled pixel count (its "map points")
// against the Controller's fixed, wired-in pixel count and surfaces any mismatch as
// an acknowledgeable warning — never a hard block. The push pipeline (H10) sends
// only pattern bytecode and keeps whatever map the device already has, so a
// count mismatch is a "this won't look right" heads-up, not an error.
//
// Transport-agnostic and React-free: the caller supplies the two counts (device
// count read via getConfig; local count from the resolved preview layout) and
// whether a map upload is opted into. The H11 scope is pixel-count fit + the
// map-overwrite guard only. A map *dimensionality* mismatch needs map read-back
// (the H13 spike) and is explicitly out of scope here — see issue #203.

/** Each distinct preflight concern. `*-device` kinds compare counts; `map-overwrite`
 *  is the shared-map guard shown only when a map push is opted into. */
export type PreflightWarningKind = 'fewer-than-device' | 'more-than-device' | 'map-overwrite'

export interface PreflightWarning {
  kind: PreflightWarningKind
  /** Human-readable, ready to render in the reconciliation dialog. */
  message: string
}

export interface PreflightInput {
  /** The open pattern's modeled pixel count — how many points its map produces. */
  localPixelCount: number
  /** The Controller's fixed pixel count (from getConfig), or null when it can't be
   *  read — in which case the pixel-fit warnings are suppressed (nothing to compare). */
  devicePixelCount: number | null
  /** True when this Send also uploads the IDE's map, overwriting the device's single
   *  shared map. Defaults false (H10/H11 push pattern bytecode only). */
  pushingMap?: boolean
}

export interface Preflight {
  /** Ordered warnings: the pixel-fit warning (if any) first, then map-overwrite. */
  warnings: PreflightWarning[]
  /** Whether any warning blocks the push. Always false in H11 — every warning is a
   *  heads-up the user can acknowledge and proceed past. */
  blocking: boolean
}

/** Reconcile the open pattern against the connected Controller. Returns the ordered
 *  warnings to show in the preflight dialog; an empty list means a clean push (the
 *  caller may then skip the dialog entirely). */
export function describePreflight({
  localPixelCount,
  devicePixelCount,
  pushingMap = false,
}: PreflightInput): Preflight {
  const warnings: PreflightWarning[] = []

  if (devicePixelCount !== null) {
    if (localPixelCount < devicePixelCount) {
      warnings.push({
        kind: 'fewer-than-device',
        message: `Only ${localPixelCount} of the Controller’s ${devicePixelCount} pixels will light up.`,
      })
    } else if (localPixelCount > devicePixelCount) {
      const extra = localPixelCount - devicePixelCount
      warnings.push({
        kind: 'more-than-device',
        message: `This pattern maps ${localPixelCount} pixels but the Controller has ${devicePixelCount}; the extra ${extra} are ignored.`,
      })
    }
  }

  if (pushingMap) {
    warnings.push({
      kind: 'map-overwrite',
      message: 'This replaces the Controller’s single shared map.',
    })
  }

  return { warnings, blocking: false }
}
