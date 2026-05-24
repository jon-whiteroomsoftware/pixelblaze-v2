import * as acorn from 'acorn'

export interface ParseError {
  message: string
  line: number    // 1-based
  column: number  // 0-based
}

/**
 * Validates Pixelblaze source, returning any parse errors or rule violations.
 *
 * Pixelblaze is a JS subset: `export var` and `export function` are valid,
 * but let/const/class/new/switch/try/throw/import are not.
 */
export function validateSource(source: string): ParseError[] {
  let ast: acorn.Program
  try {
    // sourceType:'module' so Acorn accepts top-level `export` declarations.
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module', locations: true })
  } catch (e) {
    const err = e as { message: string; loc?: { line: number; column: number } }
    return [{
      message: stripAcornSuffix(err.message),
      line: err.loc?.line ?? 1,
      column: err.loc?.column ?? 0,
    }]
  }

  const errors: ParseError[] = []
  walkAst(ast, errors)
  return errors
}

// ── AST walker ──────────────────────────────────────────────────────────────

function walkAst(node: acorn.Node, errors: ParseError[]): void {
  checkNode(node, errors)

  // Generic child traversal: visit anything that looks like a node or node[].
  for (const value of Object.values(node as unknown as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) walkAst(item as acorn.Node, errors)
      }
    } else if (isNode(value)) {
      walkAst(value as acorn.Node, errors)
    }
  }
}

function isNode(value: unknown): boolean {
  return value !== null && typeof value === 'object' && typeof (value as Record<string, unknown>).type === 'string'
}

function checkNode(node: acorn.Node, errors: ParseError[]): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any
  const start = n.loc?.start as { line: number; column: number } | undefined
  const at = { line: start?.line ?? 1, column: start?.column ?? 0 }

  switch (node.type) {
    case 'VariableDeclaration':
      if (n.kind !== 'var') {
        errors.push({
          message: `Use 'var' instead of '${n.kind}' — Pixelblaze does not support '${n.kind}'`,
          ...at,
        })
      }
      break
    case 'ClassDeclaration':
    case 'ClassExpression':
      errors.push({ message: "Classes are not supported in Pixelblaze", ...at })
      break
    case 'SwitchStatement':
      errors.push({ message: "'switch' is not supported in Pixelblaze — use if/else instead", ...at })
      break
    case 'NewExpression':
      errors.push({ message: "'new' is not supported in Pixelblaze", ...at })
      break
    case 'TryStatement':
      errors.push({ message: "'try/catch' is not supported in Pixelblaze", ...at })
      break
    case 'ThrowStatement':
      errors.push({ message: "'throw' is not supported in Pixelblaze", ...at })
      break
    case 'ImportDeclaration':
      errors.push({ message: "'import' is not supported in Pixelblaze", ...at })
      break
  }
}

// Acorn appends " (line:col)" to parse error messages — strip for display
function stripAcornSuffix(msg: string): string {
  return msg.replace(/\s*\(\d+:\d+\)$/, '')
}
