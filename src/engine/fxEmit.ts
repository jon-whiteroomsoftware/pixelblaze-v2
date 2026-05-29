import * as acorn from 'acorn'
import { fx } from './fixedpoint'

// Fixed-point preview emit.
//
// Takes a bundled pattern source (export keywords already permissible — they
// are stripped here) and re-emits it so every numeric value flows as a raw
// 16.16 int32 and every operator runs through the `fx.*` helpers. The result
// is evaluated with the fixed-point built-in shim (raw-in/raw-out wrappers),
// reproducing hardware overflow/precision that a float64 preview cannot show.
//
// This is preview-only: it never replaces the hardware `code` artifact, which
// stays plain source because hardware does fixed-point natively.

// ESTree nodes carry a wide, position-dependent shape; a precise union would
// add noise to a straight codegen, so we treat node fields as loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = Record<string, any>

const SCALE = 65536

// Binary operator → fx helper name.
const BINARY_FX: Record<string, string> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '%': 'mod',
  '&': 'and',
  '|': 'or',
  '^': 'xor',
  '<<': 'shl',
  '>>': 'shr',
  '>>>': 'shr',
  '<': 'lt',
  '>': 'gt',
  '<=': 'lte',
  '>=': 'gte',
  '==': 'eq',
  '!=': 'neq',
  '===': 'eq',
  '!==': 'neq',
}

// Compound assignment operator (without `=`) → fx helper name.
const ASSIGN_FX: Record<string, string> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '%': 'mod',
  '&': 'and',
  '|': 'or',
  '^': 'xor',
  '<<': 'shl',
  '>>': 'shr',
}

export function emitFixedPoint(code: string): string {
  const stripped = code.replace(/\bexport\s+/g, '')
  const ast = acorn.parse(stripped, { ecmaVersion: 2020, sourceType: 'script' }) as unknown as Node
  const ctx = { src: stripped }
  return (ast.body as Node[]).map((n) => gen(n, ctx)).join('\n')
}

interface Ctx {
  src: string
}

// Fall back to the original source for any node type we don't explicitly
// handle, so an unusual construct degrades to (un-transformed) float maths
// rather than crashing the preview.
function raw(node: Node, ctx: Ctx): string {
  return ctx.src.slice(node.start, node.end)
}

function gen(node: Node | null, ctx: Ctx): string {
  if (!node) return ''
  switch (node.type) {
    // ── Statements ──────────────────────────────────────────────────────────
    case 'Program':
      return (node.body as Node[]).map((n) => gen(n, ctx)).join('\n')

    case 'ExpressionStatement':
      return gen(node.expression, ctx) + ';'

    case 'BlockStatement':
      return '{\n' + (node.body as Node[]).map((n) => gen(n, ctx)).join('\n') + '\n}'

    case 'VariableDeclaration':
      return node.kind + ' ' + genDeclarations(node, ctx) + ';'

    case 'FunctionDeclaration': {
      const name = node.id ? node.id.name : ''
      const params = (node.params as Node[]).map((p) => p.name).join(', ')
      return `function ${name}(${params}) ${gen(node.body, ctx)}`
    }

    case 'ReturnStatement':
      return 'return' + (node.argument ? ' ' + gen(node.argument, ctx) : '') + ';'

    case 'IfStatement':
      return (
        `if (${gen(node.test, ctx)}) ${gen(node.consequent, ctx)}` +
        (node.alternate ? ` else ${gen(node.alternate, ctx)}` : '')
      )

    case 'ForStatement': {
      const init = node.init
        ? node.init.type === 'VariableDeclaration'
          ? node.init.kind + ' ' + genDeclarations(node.init, ctx)
          : gen(node.init, ctx)
        : ''
      const test = node.test ? gen(node.test, ctx) : ''
      const update = node.update ? gen(node.update, ctx) : ''
      return `for (${init}; ${test}; ${update}) ${gen(node.body, ctx)}`
    }

    case 'WhileStatement':
      return `while (${gen(node.test, ctx)}) ${gen(node.body, ctx)}`

    case 'DoWhileStatement':
      return `do ${gen(node.body, ctx)} while (${gen(node.test, ctx)});`

    case 'BreakStatement':
      return 'break;'

    case 'ContinueStatement':
      return 'continue;'

    case 'EmptyStatement':
      return ';'

    // ── Expressions ─────────────────────────────────────────────────────────
    case 'Literal': {
      if (typeof node.value === 'number') return String(fx.fromFloat(node.value))
      if (typeof node.value === 'boolean') return node.value ? String(SCALE) : '0'
      return JSON.stringify(node.value)
    }

    case 'Identifier':
      return node.name

    case 'BinaryExpression': {
      const helper = BINARY_FX[node.operator]
      if (!helper) return raw(node, ctx)
      return `fx.${helper}(${gen(node.left, ctx)}, ${gen(node.right, ctx)})`
    }

    case 'LogicalExpression':
      return `(${gen(node.left, ctx)} ${node.operator} ${gen(node.right, ctx)})`

    case 'UnaryExpression': {
      const arg = gen(node.argument, ctx)
      switch (node.operator) {
        case '-':
          return `(-(${arg})|0)`
        case '+':
          return arg
        case '~':
          return `fx.not(${arg})`
        case '!':
          return `((${arg}) ? 0 : ${SCALE})`
        default:
          return raw(node, ctx)
      }
    }

    case 'UpdateExpression': {
      // ++/-- : step by 1.0 (= one whole unit in raw). Pre/post distinction is
      // irrelevant in for-updates and statement position (return value unused).
      const arg = gen(node.argument, ctx)
      const helper = node.operator === '++' ? 'add' : 'sub'
      return `(${arg} = fx.${helper}(${arg}, ${SCALE}))`
    }

    case 'AssignmentExpression': {
      const left = gen(node.left, ctx)
      if (node.operator === '=') return `${left} = ${gen(node.right, ctx)}`
      const helper = ASSIGN_FX[node.operator.slice(0, -1)]
      if (!helper) return raw(node, ctx)
      return `${left} = fx.${helper}(${left}, ${gen(node.right, ctx)})`
    }

    case 'MemberExpression': {
      if (node.computed) {
        // Array index: the raw fixed-point value truncates to an integer index.
        return `${gen(node.object, ctx)}[(${gen(node.property, ctx)})>>16]`
      }
      return `${gen(node.object, ctx)}.${node.property.name}`
    }

    case 'CallExpression':
      return `${gen(node.callee, ctx)}(${(node.arguments as Node[]).map((a) => gen(a, ctx)).join(', ')})`

    case 'ConditionalExpression':
      return `(${gen(node.test, ctx)} ? ${gen(node.consequent, ctx)} : ${gen(node.alternate, ctx)})`

    case 'ArrayExpression':
      return `[${(node.elements as Node[]).map((e) => gen(e, ctx)).join(', ')}]`

    case 'SequenceExpression':
      return `(${(node.expressions as Node[]).map((e) => gen(e, ctx)).join(', ')})`

    case 'ParenthesizedExpression':
      return `(${gen(node.expression, ctx)})`

    default:
      return raw(node, ctx)
  }
}

function genDeclarations(decl: Node, ctx: Ctx): string {
  return (decl.declarations as Node[])
    .map((d) => d.id.name + (d.init ? ' = ' + gen(d.init, ctx) : ''))
    .join(', ')
}
