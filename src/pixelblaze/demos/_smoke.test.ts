import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createShim, createFxShim } from '../../engine/shim'
import { LIBRARIES } from '../libs'

const here = join(process.cwd(), 'src/pixelblaze/demos')

function runDemo(file: string, mode: 'fast' | 'fidelity' = 'fast') {
  const src = readFileSync(join(here, file), 'utf8')
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)

  let vt = 0
  const shim =
    mode === 'fidelity'
      ? createFxShim({ grid: { rows: 16, cols: 16 }, getVirtualTime: () => vt })
      : createShim({ grid: { rows: 16, cols: 16 }, getVirtualTime: () => vt })
  const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)

  // Exercise every detected control across its range. Pickers take (r,g,b),
  // toggles a bool, the rest a single 0..1 value.
  const enc = shim.encodeScalar
  for (const c of metadata.controls) {
    const fn = handle.controls[c.exportName]
    if (c.kind === 'rgbPicker' || c.kind === 'hsvPicker') {
      fn?.(enc(0), enc(0), enc(0))
      fn?.(enc(1), enc(1), enc(1))
      fn?.(enc(0.5), enc(0.5), enc(0.5))
    } else {
      fn?.(enc(0))
      fn?.(enc(1))
      fn?.(enc(0.5))
    }
  }

  let anyLit = false
  for (let frame = 0; frame < 5; frame++) {
    vt += 33 * 65.536 // ~33ms of virtual time
    handle.beforeRender(enc(33))
    for (let row = 0; row < 16; row++) {
      const y = row / 15
      for (let col = 0; col < 16; col++) {
        const x = col / 15
        const [tx, ty] = shim.transformPoint(x, y, 0)
        handle.render2D(enc(row * 16 + col), tx, ty)
        const [r, g, b] = shim.capturedPixel()
        if (r + g + b > 0.01) anyLit = true
      }
    }
  }
  return { anyLit, controlCount: metadata.controls.length }
}

describe('demo smoke tests', () => {
  for (const file of ['PlasmaNebula.js', 'Caustics.js', 'KaleidoBloom.js', 'Kishimisu.js']) {
    it(`${file} bundles, runs, lights pixels, and exposes sliders`, () => {
      let result!: ReturnType<typeof runDemo>
      expect(() => { result = runDemo(file) }).not.toThrow()
      expect(result.anyLit).toBe(true)
      expect(result.controlCount).toBeGreaterThanOrEqual(4)
    })

    it(`${file} bundles, runs, and lights pixels under fidelity (fixed-point) mode`, () => {
      let result!: ReturnType<typeof runDemo>
      expect(() => { result = runDemo(file, 'fidelity') }).not.toThrow()
      expect(result.anyLit).toBe(true)
    })
  }

  // Shader-library demos with fewer than 4 controls sit outside the loop above
  // (NeonSquircles has 1 slider; ShaderShowcase has 2) — still guard the ports.
  for (const file of ['NeonSquircles.js', 'ShaderShowcase.js', 'ZippyZaps.js']) {
    for (const mode of ['fast', 'fidelity'] as const) {
      it(`${file} bundles, runs, and lights pixels (${mode})`, () => {
        let result!: ReturnType<typeof runDemo>
        expect(() => { result = runDemo(file, mode) }).not.toThrow()
        expect(result.anyLit).toBe(true)
      })
    }
  }
})
