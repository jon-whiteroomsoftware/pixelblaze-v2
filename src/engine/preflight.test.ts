import { describe, it, expect } from 'vitest'
import { describePreflight } from './preflight'

describe('describePreflight', () => {
  it('a pattern push has no preflight, whatever the counts (#239)', () => {
    // The IDE preview resolution is unrelated to what the hardware drives, so a
    // pattern push never reconciles a count — it always pushes straight through.
    for (const local of [256, 100, 4096]) {
      const pf = describePreflight({ localPixelCount: local, devicePixelCount: 256 })
      expect(pf.warnings).toEqual([])
      expect(pf.blocking).toBe(false)
      expect(pf.remedyPixelCount).toBeNull()
    }
  })

  it('adds a map-overwrite warning only when a map push is opted into', () => {
    const without = describePreflight({ localPixelCount: 256, devicePixelCount: 256 })
    expect(without.warnings.some((w) => w.kind === 'map-overwrite')).toBe(false)

    const withMap = describePreflight({
      localPixelCount: 256,
      devicePixelCount: 256,
      pushingMap: true,
    })
    const overwrite = withMap.warnings.find((w) => w.kind === 'map-overwrite')
    expect(overwrite?.message).toBe('This replaces the Controller’s single shared map.')
  })

  it('still surfaces the map-overwrite warning when the device count is unknown', () => {
    const pf = describePreflight({
      localPixelCount: 100,
      devicePixelCount: null,
      pushingMap: true,
    })
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-overwrite'])
    expect(pf.blocking).toBe(false)
    expect(pf.remedyPixelCount).toBeNull()
  })

  // ── map-push count mismatch is a hard, blocking failure (#213) ──────────────
  it('blocks a map push whose point count does not match the device, with a remedy', () => {
    const pf = describePreflight({
      localPixelCount: 16,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.blocking).toBe(true)
    // The Controller must be set to the map's own point count for it to apply.
    expect(pf.remedyPixelCount).toBe(16)
    // map-count-mismatch comes first, then the overwrite guard.
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-count-mismatch', 'map-overwrite'])
    const [mismatch] = pf.warnings
    expect(mismatch.message).toContain('16 points')
    expect(mismatch.message).toContain('256 pixels')
    // The firmware-drop rule lives in the info-hover detail, not the headline.
    expect(mismatch.detail).toContain('silently drops')
    // No misleading pattern-oriented copy about partial application.
    expect(mismatch.message).not.toContain('will light up')
    expect(mismatch.message).not.toContain('ignored')
  })

  it('does not block a map push whose re-baked count already matches the device', () => {
    const pf = describePreflight({
      localPixelCount: 256,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.blocking).toBe(false)
    expect(pf.remedyPixelCount).toBeNull()
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-overwrite'])
  })
})
