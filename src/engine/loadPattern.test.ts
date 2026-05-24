import { describe, it, expect } from 'vitest'
import { loadPattern } from './loadPattern'

// Minimal built-ins that let patterns run without reference errors
const minimalBuiltins: Record<string, unknown> = {
  hsv: () => undefined,
  rgb: () => undefined,
  time: () => 0,
  wave: (v: number) => v,
  sin: Math.sin,
  cos: Math.cos,
  PI: Math.PI,
  PI2: Math.PI * 2,
}

// ── handle shape ──────────────────────────────────────────────────────────────

describe('loadPattern handle', () => {
  it('returns a handle with callable beforeRender and render2D', () => {
    const code = `
      export var x = 0;
      export function beforeRender(delta) { x += delta; }
      export function render2D(index, px, py) {}
    `
    const handle = loadPattern(code, { exportedVars: ['x'], controls: [] }, minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
    expect(() => handle.render2D(0, 0, 0)).not.toThrow()
  })

  it('provides no-op beforeRender when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, { exportedVars: ['x'], controls: [] }, minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
  })

  it('falls back to render(index) when render2D is not defined', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(
      code,
      { exportedVars: [], controls: [] },
      { ...minimalBuiltins, calls },
    )
    handle.render2D(3, 0.5, 0.5)
    expect(calls).toEqual([3])
  })

  it('provides no-op render2D when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, { exportedVars: ['x'], controls: [] }, minimalBuiltins)
    expect(() => handle.render2D(0, 0.5, 0.5)).not.toThrow()
  })
})

// ── getExports (live closure) ─────────────────────────────────────────────────

describe('getExports', () => {
  it('reads the initial value of an exported var', () => {
    const code = `export var counter = 7;`
    const handle = loadPattern(code, { exportedVars: ['counter'], controls: [] }, minimalBuiltins)
    expect(handle.getExports().counter).toBe(7)
  })

  it('reads the live value after mutation via beforeRender', () => {
    const code = `
      export var counter = 0;
      export function beforeRender(delta) { counter += 1; }
    `
    const handle = loadPattern(code, { exportedVars: ['counter'], controls: [] }, minimalBuiltins)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(1)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(2)
  })

  it('returns only exported vars listed in metadata', () => {
    const code = `
      export var exported = 1;
      var internal = 99;
    `
    const handle = loadPattern(
      code,
      { exportedVars: ['exported'], controls: [] },
      minimalBuiltins,
    )
    const exports = handle.getExports()
    expect(exports.exported).toBe(1)
    expect('internal' in exports).toBe(false)
  })
})

// ── controls ──────────────────────────────────────────────────────────────────

describe('controls', () => {
  it('maps a slider control to the exported function', () => {
    const code = `
      export var brightness = 0.5;
      export function sliderBrightness(v) { brightness = v; }
    `
    const handle = loadPattern(
      code,
      {
        exportedVars: ['brightness'],
        controls: [{ exportName: 'sliderBrightness', kind: 'slider', label: 'Brightness' }],
      },
      minimalBuiltins,
    )
    expect(typeof handle.controls.sliderBrightness).toBe('function')
    handle.controls.sliderBrightness(0.8)
    expect(handle.getExports().brightness).toBeCloseTo(0.8)
  })

  it('returns an empty controls object when metadata has no controls', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, { exportedVars: ['x'], controls: [] }, minimalBuiltins)
    expect(Object.keys(handle.controls)).toHaveLength(0)
  })
})
