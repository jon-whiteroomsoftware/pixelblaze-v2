import { resolveSignatureContext, BUILTIN_FUNCTIONS, BUILTIN_CONSTANTS } from './builtins'

// ── Manifest shape ───────────────────────────────────────────────────────────

describe('BUILTIN_FUNCTIONS', () => {
  it('every entry has a non-empty name', () => {
    for (const fn of BUILTIN_FUNCTIONS) {
      expect(fn.name.length).toBeGreaterThan(0)
    }
  })

  it('every entry has a params array', () => {
    for (const fn of BUILTIN_FUNCTIONS) {
      expect(Array.isArray(fn.params)).toBe(true)
    }
  })

  it('has no duplicate names', () => {
    const names = BUILTIN_FUNCTIONS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('BUILTIN_CONSTANTS', () => {
  it('has no duplicate names', () => {
    const names = BUILTIN_CONSTANTS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

// ── resolveSignatureContext ──────────────────────────────────────────────────

describe('resolveSignatureContext', () => {
  it('returns null outside any call', () => {
    expect(resolveSignatureContext('var x = 1', 9)).toBeNull()
    expect(resolveSignatureContext('', 0)).toBeNull()
  })

  it('detects param 0 immediately after the opening paren', () => {
    // cursor at column 4: `sin(|`
    expect(resolveSignatureContext('sin(', 4)).toEqual({ fnName: 'sin', activeParam: 0 })
  })

  it('advances activeParam for each comma', () => {
    // `clamp(v, lo, |`  → column 13
    expect(resolveSignatureContext('clamp(v, lo, ', 13)).toEqual({ fnName: 'clamp', activeParam: 2 })
  })

  it('handles cursor after first comma', () => {
    // `map(v, |`  → column 7
    expect(resolveSignatureContext('map(v, ', 7)).toEqual({ fnName: 'map', activeParam: 1 })
  })

  it('ignores nested parens when counting commas', () => {
    // outer call `map(sin(a), |` → outer param 1
    const line = 'map(sin(a), '
    expect(resolveSignatureContext(line, line.length)).toEqual({ fnName: 'map', activeParam: 1 })
  })

  it('resolves the innermost open call for nested calls', () => {
    // `map(sin(|` → inside sin, param 0
    const line = 'map(sin('
    expect(resolveSignatureContext(line, line.length)).toEqual({ fnName: 'sin', activeParam: 0 })
  })

  it('returns null when the cursor is after a closing paren', () => {
    // `sin(a)` cursor at end — outside all parens
    expect(resolveSignatureContext('sin(a)', 6)).toBeNull()
  })

  it('returns null for an anonymous call (no identifier before paren)', () => {
    expect(resolveSignatureContext('(', 1)).toBeNull()
  })
})
