import { bundle } from './bundle'
import { loadPattern } from './loadPattern'
import { createShim, createFxShim, type ShimContext } from './shim'
import { fx } from './fixedpoint'

// A magic-constant hash whose multiplier (43758.5453) far exceeds the 16.16
// range (±32768). On hardware — and under the fixed-point emit — the constant
// and the product overflow/wrap; a float64 preview computes it exactly. The two
// must therefore disagree, which is the whole point of the fidelity engine.
const HASH_PATTERN = `
export var probe = 0
function render2D(index, x, y) {
  probe = frac(sin(x * 12.9898) * 43758.5453)
}
`

const grid = { rows: 4, cols: 4 }

function runProbe(useFidelity: boolean): number {
  const { code, fxCode, metadata } = bundle(HASH_PATTERN, {})
  const shim: ShimContext = useFidelity
    ? createFxShim({ grid, getVirtualTime: () => 0 })
    : createShim({ grid, getVirtualTime: () => 0 })
  const handle = loadPattern(useFidelity ? fxCode : code, metadata, shim.builtins)

  const x = 0.37
  handle.render2D(shim.encodeScalar(0), shim.encodeScalar(x), shim.encodeScalar(0))
  return shim.decodeScalar(handle.getExports().probe as number)
}

describe('end-to-end fidelity vs fast preview', () => {
  it('a known-overflowing hash renders differently under each mode', () => {
    const fast = runProbe(false)
    const fidelity = runProbe(true)
    // Both are real numbers...
    expect(Number.isFinite(fast)).toBe(true)
    expect(Number.isFinite(fidelity)).toBe(true)
    // ...but the overflow makes them visibly diverge.
    expect(Math.abs(fast - fidelity)).toBeGreaterThan(0.01)
  })

  it('the hardware `code` artifact stays plain source (no fx.* wrapping)', () => {
    const { code, fxCode } = bundle(HASH_PATTERN, {})
    expect(code).not.toContain('fx.')
    expect(code).toContain('43758.5453')
    // The fixed-point emit, by contrast, is wrapped and pre-converted.
    expect(fxCode).toContain('fx.mul')
    expect(fxCode).not.toContain('43758.5453')
  })

  it('fast preview matches a direct float64 computation of the hash', () => {
    const x = 0.37
    const expected = (() => {
      const v = Math.sin(x * 12.9898) * 43758.5453
      return v - Math.trunc(v)
    })()
    expect(runProbe(false)).toBeCloseTo(expected, 6)
  })

  it('fixed-point literal 43758.5453 wraps when entering raw (int32)', () => {
    // round(43758.5453 * 65536) overflows int32 and wraps — proof the constant
    // itself cannot survive the 16.16 domain.
    expect(fx.fromFloat(43758.5453)).not.toBe(Math.round(43758.5453 * 65536))
  })
})
