import { describe, it, expect } from 'vitest'
import { describePreflight } from './preflight'

describe('describePreflight', () => {
  it('is clear when the pattern maps exactly the Controller pixel count', () => {
    const pf = describePreflight({ localPixelCount: 256, devicePixelCount: 256 })
    expect(pf.warnings).toEqual([])
    expect(pf.blocking).toBe(false)
  })

  it('warns when the pattern maps fewer pixels than the device has', () => {
    const pf = describePreflight({ localPixelCount: 100, devicePixelCount: 256 })
    expect(pf.warnings).toHaveLength(1)
    const [w] = pf.warnings
    expect(w.kind).toBe('fewer-than-device')
    expect(w.message).toBe('Only 100 of the Controller’s 256 pixels will light up.')
  })

  it('warns when the pattern maps more pixels than the device has', () => {
    const pf = describePreflight({ localPixelCount: 400, devicePixelCount: 256 })
    expect(pf.warnings).toHaveLength(1)
    const [w] = pf.warnings
    expect(w.kind).toBe('more-than-device')
    expect(w.message).toBe(
      'This pattern maps 400 pixels but the Controller has 256; the extra 144 are ignored.',
    )
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

  it('orders the fit warning before the map-overwrite warning', () => {
    const pf = describePreflight({
      localPixelCount: 100,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.warnings.map((w) => w.kind)).toEqual(['fewer-than-device', 'map-overwrite'])
  })

  it('skips the pixel-fit warnings when the device count is unknown', () => {
    const pf = describePreflight({ localPixelCount: 100, devicePixelCount: null })
    expect(pf.warnings.some((w) => w.kind.endsWith('-device'))).toBe(false)
  })

  it('still surfaces the map-overwrite warning when the device count is unknown', () => {
    const pf = describePreflight({
      localPixelCount: 100,
      devicePixelCount: null,
      pushingMap: true,
    })
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-overwrite'])
  })

  it('is never blocking — every warning is acknowledgeable', () => {
    const pf = describePreflight({
      localPixelCount: 400,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.blocking).toBe(false)
    expect(pf.warnings.length).toBeGreaterThan(0)
  })
})
