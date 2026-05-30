import { describe, it, expect } from 'vitest'
import { loadPattern, nativeDimension } from './loadPattern'
import type { PatternMetadata, RenderFns } from './loadPattern'

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

function meta(patternVars: string[], controls: PatternMetadata['controls'] = []): PatternMetadata {
  return { exportedVars: patternVars, patternVars, controls }
}

// ── handle shape ──────────────────────────────────────────────────────────────

describe('loadPattern handle', () => {
  it('returns a handle with callable beforeRender and render2D', () => {
    const code = `
      export var x = 0;
      export function beforeRender(delta) { x += delta; }
      export function render2D(index, px, py) {}
    `
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
    expect(() => handle.render2D(0, 0, 0)).not.toThrow()
  })

  it('provides no-op beforeRender when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.beforeRender(16)).not.toThrow()
  })

  it('falls back to render(index) when render2D is not defined', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render2D(3, 0.5, 0.5)
    expect(calls).toEqual([3])
  })

  it('provides no-op render2D when the pattern does not define it', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render2D(0, 0.5, 0.5)).not.toThrow()
  })

  it('exposes a 1D render slot that dispatches to render(index)', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render(5)
    expect(calls).toEqual([5])
  })

  it('provides no-op render slot when the pattern does not define render', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render(0)).not.toThrow()
  })

  it('dispatches render3D to render3D when defined', () => {
    const calls: number[][] = []
    const code = `function render3D(index, x, y, z) { calls.push([index, x, y, z]); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(2, 0.1, 0.2, 0.3)
    expect(calls).toEqual([[2, 0.1, 0.2, 0.3]])
  })

  it('render3D falls back to render2D, dropping z', () => {
    const calls: number[][] = []
    const code = `function render2D(index, x, y) { calls.push([index, x, y]); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(2, 0.1, 0.2, 0.3)
    expect(calls).toEqual([[2, 0.1, 0.2]])
  })

  it('render3D falls back to render, dropping x/y/z', () => {
    const calls: number[] = []
    const code = `function render(index) { calls.push(index); }`
    const handle = loadPattern(code, meta([]), { ...minimalBuiltins, calls })
    handle.render3D(7, 0.1, 0.2, 0.3)
    expect(calls).toEqual([7])
  })

  it('provides no-op render3D when no render fn is defined', () => {
    const code = `export var x = 0;`
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(() => handle.render3D(0, 0, 0, 0)).not.toThrow()
  })
})

// ── nativeDimension ─────────────────────────────────────────────────────────

describe('nativeDimension', () => {
  function fns(over: Partial<RenderFns>): RenderFns {
    return { hasBeforeRender: false, hasRender2D: false, hasRender: false, hasRender3D: false, ...over }
  }

  it('returns 1 for a render-only pattern', () => {
    expect(nativeDimension(fns({ hasRender: true }))).toBe(1)
  })

  it('returns 2 for a render2D pattern', () => {
    expect(nativeDimension(fns({ hasRender2D: true }))).toBe(2)
  })

  it('returns 3 for a render3D pattern', () => {
    expect(nativeDimension(fns({ hasRender3D: true }))).toBe(3)
  })

  it('picks the highest render fn when several are defined', () => {
    expect(nativeDimension(fns({ hasRender: true, hasRender2D: true, hasRender3D: true }))).toBe(3)
  })

  it('defaults to 2 when no render fn (or no metadata) is present', () => {
    expect(nativeDimension(fns({}))).toBe(2)
    expect(nativeDimension(undefined)).toBe(2)
  })
})

// ── getExports (live closure) ─────────────────────────────────────────────────

describe('getExports', () => {
  it('reads the initial value of an exported var', () => {
    const code = `export var counter = 7;`
    const handle = loadPattern(code, meta(['counter']), minimalBuiltins)
    expect(handle.getExports().counter).toBe(7)
  })

  it('reads the live value after mutation via beforeRender', () => {
    const code = `
      export var counter = 0;
      export function beforeRender(delta) { counter += 1; }
    `
    const handle = loadPattern(code, meta(['counter']), minimalBuiltins)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(1)
    handle.beforeRender(16)
    expect(handle.getExports().counter).toBe(2)
  })

  it('reads non-exported top-level vars listed in patternVars', () => {
    const code = `
      var internal = 42;
      export var exported = 1;
    `
    const handle = loadPattern(code, meta(['internal', 'exported']), minimalBuiltins)
    const exports = handle.getExports()
    expect(exports.internal).toBe(42)
    expect(exports.exported).toBe(1)
  })

  it('does not expose vars absent from patternVars', () => {
    const code = `
      export var exported = 1;
      var hidden = 99;
    `
    const handle = loadPattern(code, meta(['exported']), minimalBuiltins)
    const exports = handle.getExports()
    expect(exports.exported).toBe(1)
    expect('hidden' in exports).toBe(false)
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
        patternVars: ['brightness'],
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
    const handle = loadPattern(code, meta(['x']), minimalBuiltins)
    expect(Object.keys(handle.controls)).toHaveLength(0)
  })
})
