import { describe, it, expect } from 'vitest'
import { validateSource } from './validate'
import { SEED_PATTERN } from '@/pixelblaze/seedPattern'

// ── Valid Pixelblaze ─────────────────────────────────────────────────────────

describe('valid Pixelblaze code', () => {
  it('accepts empty source', () => {
    expect(validateSource('')).toEqual([])
  })

  it('accepts var declarations', () => {
    expect(validateSource('var x = 1')).toEqual([])
  })

  it('accepts export var — the primary control export form', () => {
    expect(validateSource('export var speed = 0.5')).toEqual([])
  })

  it('accepts multiple export vars', () => {
    const src = 'export var a = 1\nexport var b = 2\nexport var c = 3'
    expect(validateSource(src)).toEqual([])
  })

  it('accepts export function — how render fns are declared', () => {
    expect(validateSource('export function render(index) {}')).toEqual([])
  })

  it('accepts export function with a body using var', () => {
    const src = 'export function beforeRender(delta) { var t = delta * 0.05 }'
    expect(validateSource(src)).toEqual([])
  })

  it('accepts non-exported var function', () => {
    expect(validateSource('function render(index) { var h = index / pixelCount; hsv(h, 1, 1) }')).toEqual([])
  })

  it('accepts if/else', () => {
    expect(validateSource('var x = 1\nif (x > 0) { x = 0 } else { x = 1 }')).toEqual([])
  })

  it('accepts for loops', () => {
    expect(validateSource('for (var i = 0; i < 10; i++) { }')).toEqual([])
  })

  it('accepts while loops', () => {
    expect(validateSource('var i = 0\nwhile (i < 10) { i = i + 1 }')).toEqual([])
  })

  it('accepts the full seed pattern without errors', () => {
    expect(validateSource(SEED_PATTERN)).toEqual([])
  })

  // Arrow / lambda functions: explicitly listed as a supported form in the language reference
  it('accepts arrow function assigned to a variable', () => {
    expect(validateSource('myFunction = (arg1) => arg1 * 2')).toEqual([])
  })

  it('accepts arrow function stored in an array slot (lookup table pattern)', () => {
    const src = 'var modes = array(3)\nmodes[0] = () => 0\nmodes[1] = () => 1'
    expect(validateSource(src)).toEqual([])
  })

  it('accepts concise arrow body (expression, no braces)', () => {
    expect(validateSource('var fn = (x) => x * 0.5')).toEqual([])
  })

  it('accepts block-body arrow function', () => {
    expect(validateSource('var fn = (x) => { var y = x * 2; return y }')).toEqual([])
  })

  // Implicit global assignment: valid Pixelblaze — "foo = wave(time(0.1))" works as a global
  it('accepts implicit global assignment without var', () => {
    expect(validateSource('foo = 1')).toEqual([])
  })

  it('accepts implicit global assignment inside a function', () => {
    expect(validateSource('function f() { globalVal = 42 }')).toEqual([])
  })

  // export var without an initializer: used for sensor expansion board vars
  it('accepts export var without an initializer (sensor board pattern)', () => {
    expect(validateSource('export var frequencyData')).toEqual([])
  })

  it('accepts the sensor expansion board export pattern', () => {
    const src = [
      'export var frequencyData',
      'export var energyAverage',
      'export var maxFrequencyMagnitude',
      'export var maxFrequency',
      'export var accelerometer',
      'export var light',
      'export var analogInputs',
    ].join('\n')
    expect(validateSource(src)).toEqual([])
  })

  // Ternary operator: listed in supported operators
  it('accepts the ternary operator', () => {
    expect(validateSource('var x = 1\nvar y = x > 0 ? x : 0')).toEqual([])
  })

  // Bitwise operators: listed as supported (behave on all 32 bits, unlike standard JS)
  it('accepts bitwise operators', () => {
    expect(validateSource('var a = 5\nvar b = a >> 1\nvar c = a << 2\nvar d = a | 3\nvar e = a & 1\nvar f = a ^ 7\nvar g = ~a')).toEqual([])
  })

  // Array dot-method calls: supported via the arrayXxx / a.method() duality
  it('accepts array dot-method calls', () => {
    const src = 'var a = array(10)\na.sort()\nvar n = a.length\na.forEach((v) => v * 2)'
    expect(validateSource(src)).toEqual([])
  })

  // Array literals used as data (e.g. setPalette)
  it('accepts array literals used as data', () => {
    const src = 'var grad = [0, 0, 0, 0, 0.75, 1, 0, 1, 1, 0, 1, 1]\nsetPalette(grad)'
    expect(validateSource(src)).toEqual([])
  })

  // break and continue inside loops
  it('accepts break and continue inside loops', () => {
    const src = 'for (var i = 0; i < 10; i++) { if (i == 5) break; if (i == 3) continue }'
    expect(validateSource(src)).toEqual([])
  })

  // Functions stored in variables and passed as arguments
  it('accepts functions stored in variables', () => {
    expect(validateSource('var fn = function(x) { return x * 2 }\nvar result = fn(5)')).toEqual([])
  })

  it('accepts functions passed as arguments (higher-order)', () => {
    const src = 'function apply(fn, v) { return fn(v) }\napply((x) => x + 1, 5)'
    expect(validateSource(src)).toEqual([])
  })

  // Exporter control function signatures from the language reference
  it('accepts slider control export', () => {
    expect(validateSource('export function sliderMySlider(v) { }')).toEqual([])
  })

  it('accepts hsvPicker control export', () => {
    expect(validateSource('export function hsvPickerPrimaryColor(h, s, v) { }')).toEqual([])
  })

  it('accepts rgbPicker control export', () => {
    expect(validateSource('export function rgbPickerPrimaryColor(r, g, b) { }')).toEqual([])
  })

  it('accepts toggle control export', () => {
    expect(validateSource('export function toggleEnableAwesomeness(isEnabled) { }')).toEqual([])
  })

  it('accepts trigger control export (no params)', () => {
    expect(validateSource('export function triggerFireLasers() { }')).toEqual([])
  })
})

// ── Syntax errors ────────────────────────────────────────────────────────────

describe('syntax errors', () => {
  it('returns one error for an incomplete expression', () => {
    const errors = validateSource('var x = (')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBeTruthy()
  })

  it('strips the acorn "(line:col)" suffix from error messages', () => {
    const errors = validateSource('var x = (')
    expect(errors[0].message).not.toMatch(/\(\d+:\d+\)$/)
  })

  it('reports the error on line 1 for a single-line mistake', () => {
    const errors = validateSource('var x = (')
    expect(errors[0].line).toBe(1)
  })

  it('reports the correct line for a multi-line syntax error', () => {
    const errors = validateSource('var a = 1\nvar b = 2\nvar c = (')
    expect(errors[0].line).toBe(3)
  })

  it('returns the error shape with all required fields', () => {
    const errors = validateSource('{{{')
    expect(errors[0]).toMatchObject({
      message: expect.any(String),
      line: expect.any(Number),
      column: expect.any(Number),
    })
  })
})

// ── Pixelblaze rule violations ────────────────────────────────────────────────

describe('let/const — use var instead', () => {
  it("flags 'let'", () => {
    const errors = validateSource('let x = 1')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/let/)
  })

  it("flags 'const'", () => {
    const errors = validateSource('const x = 1')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/const/)
  })

  it("flags 'let' inside a function body", () => {
    const errors = validateSource('function render(i) { let x = 1 }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/let/)
  })

  it("flags 'const' inside a function body", () => {
    const errors = validateSource('function render(i) { const h = i / 100 }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/const/)
  })

  it("flags 'export const' — only export var is valid", () => {
    const errors = validateSource('export const speed = 0.5')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/const/)
  })

  it('reports the correct line for a let on line 2', () => {
    const errors = validateSource('var a = 1\nlet b = 2')
    expect(errors[0].line).toBe(2)
  })
})

describe('class — not supported', () => {
  it('flags a class declaration', () => {
    const errors = validateSource('class Foo {}')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/class/i)
  })

  it('flags a class expression', () => {
    const errors = validateSource('var Foo = class {}')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/class/i)
  })

  it('flags a class with extends', () => {
    const errors = validateSource('class Bar extends Foo {}')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/class/i)
  })
})

describe('switch — not supported', () => {
  it('flags a switch statement', () => {
    const errors = validateSource('var x = 1\nswitch (x) { case 1: break }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/switch/i)
  })

  it('reports the line of the switch keyword', () => {
    const errors = validateSource('var x = 1\nswitch (x) { case 1: break }')
    expect(errors[0].line).toBe(2)
  })
})

describe('new — not supported', () => {
  it('flags a new expression', () => {
    const errors = validateSource('var x = new Foo()')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/new/)
  })

  it('flags new inside a function', () => {
    const errors = validateSource('function render(i) { var a = new Array(10) }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/new/)
  })
})

describe('try/catch — not supported', () => {
  it('flags a try/catch block', () => {
    const errors = validateSource('try { } catch (e) { }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/try/i)
  })

  it('flags try with finally', () => {
    const errors = validateSource('try { } finally { }')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/try/i)
  })
})

describe('throw — not supported', () => {
  it('flags a throw statement (using a string, not new)', () => {
    // Use a string throw to isolate throw from new — both are separately disallowed
    const errors = validateSource('throw "oops"')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/throw/)
  })

  it('flags both throw and new when used together', () => {
    const errors = validateSource('throw new Error("bad")')
    const messages = errors.map((e) => e.message)
    expect(messages.some((m) => /throw/.test(m))).toBe(true)
    expect(messages.some((m) => /new/.test(m))).toBe(true)
  })
})

describe('import — not supported', () => {
  it('flags an import declaration', () => {
    const errors = validateSource('import foo from "bar"')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/import/)
  })

  it('flags a named import', () => {
    const errors = validateSource('import { foo, bar } from "baz"')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/import/)
  })
})

// ── Multiple violations ───────────────────────────────────────────────────────

describe('multiple violations', () => {
  it('reports all violations in a file with multiple problems', () => {
    const src = 'let x = 1\nconst y = 2\nvar z = new Foo()'
    const errors = validateSource(src)
    const messages = errors.map((e) => e.message)
    expect(messages.some((m) => /let/.test(m))).toBe(true)
    expect(messages.some((m) => /const/.test(m))).toBe(true)
    expect(messages.some((m) => /new/.test(m))).toBe(true)
  })
})
