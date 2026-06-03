import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bundle } from '../../engine/bundle'
import { loadPattern } from '../../engine/loadPattern'
import { createShim, createFxShim, planeShimConfig } from '../../engine/shim'
import { LIBRARIES } from '../libs'

const here = join(process.cwd(), 'src/pixelblaze/demos')

function runDemo(file: string, mode: 'fast' | 'fidelity' = 'fast') {
  const src = readFileSync(join(here, file), 'utf8')
  const { code, fxCode, metadata } = bundle(src, LIBRARIES)

  let vt = 0
  const shim =
    mode === 'fidelity'
      ? createFxShim({ ...planeShimConfig({ rows: 16, cols: 16 }), getVirtualTime: () => vt })
      : createShim({ ...planeShimConfig({ rows: 16, cols: 16 }), getVirtualTime: () => vt })
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
  for (const file of ['PlasmaNebula.js', 'Caustics.js', 'KaleidoBloom.js', 'Kishimisu.js', 'PhantomStar.js']) {
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

  // Dimensionality test patterns: one render fn each, no controls. Guard that
  // each bundles, lights pixels via its dispatch path, and exposes only the
  // expected render fn so the 1D / 2D / 3D verify-by-eye demos stay honest.
  const dimCases = [
    { file: 'TestPattern1D.js', arity: 1, flag: 'hasRender' as const },
    { file: 'TestPattern2D.js', arity: 2, flag: 'hasRender2D' as const },
    { file: 'TestPattern3D.js', arity: 3, flag: 'hasRender3D' as const },
  ]
  for (const { file, arity, flag } of dimCases) {
    it(`${file} bundles, runs, and lights pixels via its render${arity === 1 ? '' : `${arity}D`} path`, () => {
      const src = readFileSync(join(here, file), 'utf8')
      const { code, metadata } = bundle(src, LIBRARIES)
      expect(metadata.renderFns[flag]).toBe(true)

      const shim = createShim({ ...planeShimConfig({ rows: 16, cols: 16 }), getVirtualTime: () => 0 })
      const handle = loadPattern(code, metadata, shim.builtins)
      const enc = shim.encodeScalar

      let anyLit = false
      handle.beforeRender(enc(33))
      for (let i = 0; i < 64; i++) {
        const idx = enc(i)
        if (arity === 1) handle.render(idx)
        else if (arity === 2) handle.render2D(idx, enc(i / 63), enc((63 - i) / 63))
        else handle.render3D(idx, enc(i / 63), enc((63 - i) / 63), enc(i / 63))
        const [r, g, b] = shim.capturedPixel()
        if (r + g + b > 0.01) anyLit = true
      }
      expect(anyLit).toBe(true)
    })
  }

  // "Living 1D" demos: 1D render()-only patterns (rhythm / emergence).
  // Run on a 1D strip through the render() dispatch path, exercising controls and
  // several frames of beforeRender so the stateful ones (firefly arrays) actually
  // advance. Each must light pixels and expose its sliders.
  for (const file of ['PulseLoom.js', 'FireflyChoir.js']) {
    it(`${file} bundles, runs render(), lights pixels, and exposes sliders`, () => {
      const N = 120
      const src = readFileSync(join(here, file), 'utf8')
      const { code, metadata } = bundle(src, LIBRARIES)
      expect(metadata.renderFns.hasRender).toBe(true)
      expect(metadata.controls.length).toBeGreaterThanOrEqual(3)

      let vt = 0
      const mapPoints = Array.from({ length: N }, (_, i) => {
        const x = i / (N - 1)
        return { sample: [x] as [number], pos: [x, 0] as [number, number] }
      })
      const shim = createShim({ mapPoints, pixelCount: N, dimensions: 1, getVirtualTime: () => vt })
      const handle = loadPattern(code, metadata, shim.builtins)
      const enc = shim.encodeScalar

      // Drive every control to a mid value so stateful sliders take effect.
      for (const c of metadata.controls) {
        const fn = handle.controls[c.exportName]
        if (c.kind === 'rgbPicker' || c.kind === 'hsvPicker') fn?.(enc(0.5), enc(0.5), enc(0.5))
        else fn?.(enc(0.5))
      }

      let anyLit = false
      for (let frame = 0; frame < 8; frame++) {
        vt += 33 * 65.536
        handle.beforeRender(enc(33))
        for (let i = 0; i < N; i++) {
          handle.render(enc(i))
          const [r, g, b] = shim.capturedPixel()
          if (r + g + b > 0.01) anyLit = true
        }
      }
      expect(anyLit).toBe(true)
    })
  }

  // AuroraSphere is a self-calibrating 3D pattern: it scans the map via
  // mapPixels to learn center + radius, then paints over render3D. Run it on a
  // synthetic Fibonacci-ish sphere so calibration has real geometry to read.
  it('AuroraSphere bundles, calibrates, runs render3D, and lights pixels', () => {
    const N = 200
    const mapPoints = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2 // -1..1
      const r = Math.sqrt(1 - y * y)
      const theta = i * 2.399963 // golden angle
      const pos: [number, number, number] = [
        0.5 + 0.5 * r * Math.cos(theta),
        0.5 + 0.5 * y,
        0.5 + 0.5 * r * Math.sin(theta),
      ]
      return { sample: pos, pos }
    })

    const src = readFileSync(join(here, 'AuroraSphere.js'), 'utf8')
    const { code, metadata } = bundle(src, LIBRARIES)
    expect(metadata.renderFns.hasRender3D).toBe(true)
    expect(metadata.controls.length).toBeGreaterThanOrEqual(3)

    const shim = createShim({ mapPoints, pixelCount: N, dimensions: 3, getVirtualTime: () => 0 })
    const handle = loadPattern(code, metadata, shim.builtins)
    const enc = shim.encodeScalar

    let anyLit = false
    for (let frame = 0; frame < 3; frame++) {
      handle.beforeRender(enc(33))
      for (let i = 0; i < N; i++) {
        const [x, y, z] = mapPoints[i].pos
        const [tx, ty, tz] = shim.transformPoint(x, y, z)
        handle.render3D(enc(i), tx, ty, tz)
        const [r, g, b] = shim.capturedPixel()
        if (r + g + b > 0.01) anyLit = true
      }
    }
    expect(anyLit).toBe(true)
  })

  // NebulaSphere is a coordinate-driven 3D pattern (no self-calibration): it
  // feeds real (x,y,z) straight into 3D perlinFbm over render3D. Run it on the
  // same synthetic sphere so the volumetric slice has real geometry to sample.
  for (const mode of ['fast', 'fidelity'] as const) {
    it(`NebulaSphere bundles, runs render3D, lights pixels, and exposes sliders (${mode})`, () => {
      const N = 200
      const mapPoints = Array.from({ length: N }, (_, i) => {
        const y = 1 - (i / (N - 1)) * 2 // -1..1
        const r = Math.sqrt(1 - y * y)
        const theta = i * 2.399963 // golden angle
        const pos: [number, number, number] = [
          0.5 + 0.5 * r * Math.cos(theta),
          0.5 + 0.5 * y,
          0.5 + 0.5 * r * Math.sin(theta),
        ]
        return { sample: pos, pos }
      })

      const src = readFileSync(join(here, 'NebulaSphere.js'), 'utf8')
      const { code, fxCode, metadata } = bundle(src, LIBRARIES)
      expect(metadata.renderFns.hasRender3D).toBe(true)
      expect(metadata.controls.length).toBeGreaterThanOrEqual(4)

      let vt = 0
      const shim =
        mode === 'fidelity'
          ? createFxShim({ mapPoints, pixelCount: N, dimensions: 3, getVirtualTime: () => vt })
          : createShim({ mapPoints, pixelCount: N, dimensions: 3, getVirtualTime: () => vt })
      const handle = loadPattern(mode === 'fidelity' ? fxCode : code, metadata, shim.builtins)
      const enc = shim.encodeScalar

      let anyLit = false
      for (let frame = 0; frame < 3; frame++) {
        vt += 33 * 65.536
        handle.beforeRender(enc(33))
        for (let i = 0; i < N; i++) {
          const [x, y, z] = mapPoints[i].pos
          const [tx, ty, tz] = shim.transformPoint(x, y, z)
          handle.render3D(enc(i), tx, ty, tz)
          const [r, g, b] = shim.capturedPixel()
          if (r + g + b > 0.01) anyLit = true
        }
      }
      expect(anyLit).toBe(true)
    })
  }

  // Shader-library demos with fewer than 4 controls sit outside the loop above
  // (NeonSquircles has 1 slider; ShaderShowcase has 2) — still guard the ports.
  for (const file of ['NeonSquircles.js', 'ShaderShowcase.js', 'ZippyZaps.js', 'IQPalettes.js']) {
    for (const mode of ['fast', 'fidelity'] as const) {
      it(`${file} bundles, runs, and lights pixels (${mode})`, () => {
        let result!: ReturnType<typeof runDemo>
        expect(() => { result = runDemo(file, mode) }).not.toThrow()
        expect(result.anyLit).toBe(true)
      })
    }
  }
})
