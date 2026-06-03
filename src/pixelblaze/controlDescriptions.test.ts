import { bundle } from '@/engine/bundle'
import { DEMOS } from './demos'
import { LIBRARIES } from './libs'
import { CONTROL_DESCRIPTIONS, withControlDescriptions } from './controlDescriptions'

// The set of control exportNames each demo actually defines, recovered the same
// way the app does it — by bundling the demo source. This is the source of truth
// the curated table is checked against.
const controlsByDemo = new Map<string, string[]>(
  Object.entries(DEMOS).map(([name, src]) => [
    name,
    bundle(src, LIBRARIES).metadata.controls.map((c) => c.exportName),
  ]),
)

describe('control descriptions stay in sync with the demos', () => {
  // Coverage: every control a demo defines must have a curated description, so a
  // newly added control fails the build until it gets one.
  for (const [demo, exportNames] of controlsByDemo) {
    if (exportNames.length === 0) continue
    it(`${demo}: every control has a description`, () => {
      const table = CONTROL_DESCRIPTIONS[demo] ?? {}
      const missing = exportNames.filter((name) => !table[name]?.trim())
      expect(missing, `missing descriptions for ${demo}: ${missing.join(', ')}`).toEqual([])
    })
  }

  // No orphans: every demo key in the table must exist...
  it('has no descriptions for unknown demos', () => {
    const unknown = Object.keys(CONTROL_DESCRIPTIONS).filter((demo) => !controlsByDemo.has(demo))
    expect(unknown, `descriptions for demos not in DEMOS: ${unknown.join(', ')}`).toEqual([])
  })

  // ...and every described control must be a control that demo still defines, so
  // a renamed/removed control fails the build until its stale entry is cleaned up.
  for (const [demo, table] of Object.entries(CONTROL_DESCRIPTIONS)) {
    it(`${demo}: has no descriptions for removed controls`, () => {
      const exportNames = new Set(controlsByDemo.get(demo) ?? [])
      const orphans = Object.keys(table).filter((name) => !exportNames.has(name))
      expect(orphans, `stale descriptions in ${demo}: ${orphans.join(', ')}`).toEqual([])
    })
  }
})

describe('withControlDescriptions', () => {
  it('fills description onto matching controls for a known demo', () => {
    const result = withControlDescriptions('Caustics', [
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed' },
    ])
    expect(result[0].description).toBe(CONTROL_DESCRIPTIONS.Caustics.sliderSpeed)
  })

  it('leaves controls unchanged for an unknown or null demo', () => {
    const controls = [{ exportName: 'sliderSpeed', kind: 'slider', label: 'Speed' }]
    expect(withControlDescriptions('NotADemo', controls)).toEqual(controls)
    expect(withControlDescriptions(null, controls)).toEqual(controls)
  })

  it('leaves a control with no curated entry without a description', () => {
    const result = withControlDescriptions('Caustics', [
      { exportName: 'sliderNonexistent', kind: 'slider', label: 'Nonexistent' },
    ])
    expect(result[0].description).toBeUndefined()
  })
})
