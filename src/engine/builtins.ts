export interface BuiltinFn {
  name: string
  params: string[]
}

export interface BuiltinConst {
  name: string
}

export interface SignatureContext {
  fnName: string
  activeParam: number
}

export const BUILTIN_FUNCTIONS: readonly BuiltinFn[] = [
  // Render callbacks
  { name: 'render',        params: ['index'] },
  { name: 'render2D',      params: ['index', 'x', 'y'] },
  { name: 'beforeRender',  params: ['delta'] },
  { name: 'afterRender',   params: [] },
  // Color
  { name: 'hsv',           params: ['h', 's', 'v'] },
  { name: 'rgb',           params: ['r', 'g', 'b'] },
  // Waveform / interpolation
  { name: 'time',          params: ['interval'] },
  { name: 'wave',          params: ['v'] },
  { name: 'triangle',      params: ['v'] },
  { name: 'square',        params: ['v'] },
  { name: 'clamp',         params: ['v', 'lo', 'hi'] },
  { name: 'map',           params: ['v', 'fromLow', 'fromHigh', 'toLow', 'toHigh'] },
  // Math
  { name: 'sin',           params: ['v'] },
  { name: 'cos',           params: ['v'] },
  { name: 'tan',           params: ['v'] },
  { name: 'asin',          params: ['v'] },
  { name: 'acos',          params: ['v'] },
  { name: 'atan2',         params: ['y', 'x'] },
  { name: 'abs',           params: ['v'] },
  { name: 'floor',         params: ['v'] },
  { name: 'ceil',          params: ['v'] },
  { name: 'round',         params: ['v'] },
  { name: 'sqrt',          params: ['v'] },
  { name: 'pow',           params: ['base', 'exp'] },
  { name: 'log',           params: ['v'] },
  { name: 'log2',          params: ['v'] },
  { name: 'min',           params: ['a', 'b'] },
  { name: 'max',           params: ['a', 'b'] },
  { name: 'random',        params: ['max'] },
]

export const BUILTIN_CONSTANTS: readonly BuiltinConst[] = [
  { name: 'PI' },
  { name: 'E' },
  { name: 'pixelCount' },
]

// ── Signature context resolution ────────────────────────────────────────────

/**
 * Given line content and a 0-based column, walks backwards to find which
 * function call the cursor is inside and which parameter position is active.
 * Returns null if the cursor is not inside a known call.
 */
export function resolveSignatureContext(
  line: string,
  column: number,
): SignatureContext | null {
  let depth = 0
  let activeParam = 0

  for (let i = column - 1; i >= 0; i--) {
    const ch = line[i]
    if (ch === ')') {
      depth++
    } else if (ch === '(') {
      if (depth > 0) {
        depth--
        continue
      }
      // Found the opening paren for this call — read the function name.
      const end = i
      let start = end - 1
      while (start >= 0 && /[\w$]/.test(line[start])) start--
      start++
      const fnName = line.slice(start, end)
      if (!fnName) return null
      return { fnName, activeParam }
    } else if (ch === ',' && depth === 0) {
      activeParam++
    }
  }

  return null
}
