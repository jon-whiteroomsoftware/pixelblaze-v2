import { emitFixedPoint } from './fxEmit'
import { fx } from './fixedpoint'

// Evaluate a fixed-point-emitted expression with the fx engine in scope and
// return the float-decoded result.
function evalFx(exprSrc: string): number {
  const fxSrc = emitFixedPoint(`var __r = ${exprSrc}`)
  const factory = new Function('fx', `${fxSrc}\nreturn __r`)
  return fx.toFloat(factory(fx))
}

describe('emitFixedPoint: literals', () => {
  it('converts a numeric literal to its raw int32', () => {
    expect(emitFixedPoint('var x = 1')).toBe('var x = 65536;')
  })

  it('converts a fractional literal to raw', () => {
    expect(emitFixedPoint('var x = 0.5')).toBe('var x = 32768;')
  })
})

describe('emitFixedPoint: arithmetic', () => {
  it('maps + - * / % to fx helpers', () => {
    expect(evalFx('1 + 2')).toBeCloseTo(3, 4)
    expect(evalFx('5 - 3')).toBeCloseTo(2, 4)
    expect(evalFx('1.5 * 2')).toBeCloseTo(3, 4)
    expect(evalFx('3 / 2')).toBeCloseTo(1.5, 4)
    expect(evalFx('7 % 3')).toBeCloseTo(1, 4)
  })

  it('respects precedence through nesting', () => {
    expect(evalFx('1 + 2 * 3')).toBeCloseTo(7, 4)
    expect(evalFx('(1 + 2) * 3')).toBeCloseTo(9, 4)
  })

  it('handles unary minus', () => {
    expect(evalFx('-2.5')).toBeCloseTo(-2.5, 4)
    expect(evalFx('-(1 + 1)')).toBeCloseTo(-2, 4)
  })
})

describe('emitFixedPoint: comparisons return raw booleans', () => {
  it('true compares yield 1.0, false yield 0', () => {
    expect(evalFx('2 > 1')).toBeCloseTo(1, 4)
    expect(evalFx('1 > 2')).toBeCloseTo(0, 4)
    expect(evalFx('2 == 2')).toBeCloseTo(1, 4)
  })
})

describe('emitFixedPoint: array indexing truncates the raw index', () => {
  it('indexes by the integer part of a fixed-point value', () => {
    const src = emitFixedPoint('var a = [10, 20, 30]\nvar r = a[1.9]')
    const factory = new Function('fx', `${src}\nreturn r`)
    // a[1.9] → a[1] on hardware; values are themselves raw.
    expect(fx.toFloat(factory(fx))).toBeCloseTo(20, 4)
  })
})

describe('emitFixedPoint: control flow is preserved', () => {
  it('keeps for-loops, if, and accumulation working', () => {
    const src = emitFixedPoint(
      'function f() { var s = 0; for (var i = 0; i < 4; i++) { if (i > 1) s += i } return s }',
    )
    const factory = new Function('fx', `${src}\nreturn f()`)
    // i = 2 and 3 contribute → 5
    expect(fx.toFloat(factory(fx))).toBeCloseTo(5, 4)
  })
})
