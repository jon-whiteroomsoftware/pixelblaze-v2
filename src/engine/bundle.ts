import * as acorn from 'acorn'
import { type PatternMetadata, type RenderFns } from './loadPattern'
import { emitFixedPoint } from './fxEmit'

export interface BundleMetadata extends PatternMetadata {
  renderFns: RenderFns
}

// ── AST utilities ────────────────────────────────────────────────────────────

function walkAst(node: unknown, visitor: (n: unknown) => void): void {
  if (!node || typeof node !== 'object') return
  visitor(node)
  for (const val of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, visitor)
    } else {
      walkAst(val, visitor)
    }
  }
}

function parseScript(src: string): unknown {
  return acorn.parse(src, { ecmaVersion: 2020, sourceType: 'script' })
}

function parseModule(src: string): unknown {
  return acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module' })
}

// ── metadata extraction ──────────────────────────────────────────────────────

const RENDER_FN_NAMES = new Set(['beforeRender', 'render2D', 'render', 'render3D'])
const CONTROL_PREFIXES = ['hsvPicker', 'rgbPicker', 'slider', 'toggle'] as const

function labelFromSuffix(suffix: string): string {
  return suffix.replace(/([A-Z])/g, ' $1').trim()
}

const SKIP_VAR_NAMES = new Set([...['beforeRender', 'render2D', 'render', 'render3D']])

function extractMetadata(ast: unknown): BundleMetadata {
  const exportedVars: string[] = []
  const patternVars: string[] = []
  const controls: PatternMetadata['controls'] = []
  const renderFns: RenderFns = {
    hasBeforeRender: false,
    hasRender2D: false,
    hasRender: false,
    hasRender3D: false,
  }
  const seen = new Set<string>()

  function addVar(name: string): void {
    if (!seen.has(name) && !SKIP_VAR_NAMES.has(name)) {
      seen.add(name)
      patternVars.push(name)
    }
  }

  const topLevel = (ast as { body: Record<string, unknown>[] }).body ?? []

  for (const node of topLevel) {
    const n = node as Record<string, unknown>

    if (n['type'] === 'ExportNamedDeclaration') {
      const decl = n['declaration'] as Record<string, unknown> | null
      if (!decl) continue

      if (decl['type'] === 'VariableDeclaration') {
        for (const d of (decl['declarations'] as Record<string, unknown>[]) ?? []) {
          const id = d['id'] as Record<string, unknown>
          if (id?.['type'] === 'Identifier') {
            const name = id['name'] as string
            exportedVars.push(name)
            addVar(name)
          }
        }
      }

      if (decl['type'] === 'FunctionDeclaration') {
        const name = (decl['id'] as Record<string, unknown>)?.['name'] as string
        if (!name) continue
        markRenderFn(name, renderFns)
        for (const prefix of CONTROL_PREFIXES) {
          if (name.startsWith(prefix) && name.length > prefix.length) {
            const label = labelFromSuffix(name.slice(prefix.length))
            const control: PatternMetadata['controls'][number] = { exportName: name, kind: prefix, label }
            if (prefix === 'hsvPicker' || prefix === 'rgbPicker') {
              control.pickerVars = extractPickerVars(decl)
            }
            controls.push(control)
            break
          }
        }
      }
    }

    // Non-exported top-level var declarations
    if (n['type'] === 'VariableDeclaration') {
      for (const d of (n['declarations'] as Record<string, unknown>[]) ?? []) {
        const id = d['id'] as Record<string, unknown>
        if (id?.['type'] === 'Identifier') addVar(id['name'] as string)
      }
    }

    // Non-exported function declarations (render fns don't need to be exported)
    if (n['type'] === 'FunctionDeclaration') {
      const name = (n['id'] as Record<string, unknown>)?.['name'] as string
      if (name && RENDER_FN_NAMES.has(name)) markRenderFn(name, renderFns)
    }
  }

  return { exportedVars, patternVars, controls, renderFns }
}

// A picker function maps its parameters to top-level vars via simple
// `someVar = param` assignments, e.g. `rgbPickerA(r,g,b){ ar=r; ag=g; ab=b }`.
// Recover the backing var for each parameter (in param order) so the UI can
// seed the swatch from those vars' initial values. Parameters with no matching
// assignment yield an empty slot (filtered out by the caller via length check).
function extractPickerVars(decl: Record<string, unknown>): string[] {
  const params = (decl['params'] as Record<string, unknown>[]) ?? []
  const paramNames = params.map((p) => (p?.['type'] === 'Identifier' ? (p['name'] as string) : ''))

  // param name → assigned var name
  const assigned = new Map<string, string>()
  walkAst(decl['body'], (n) => {
    const node = n as Record<string, unknown>
    if (node?.['type'] !== 'AssignmentExpression' || node['operator'] !== '=') return
    const left = node['left'] as Record<string, unknown>
    const right = node['right'] as Record<string, unknown>
    if (left?.['type'] === 'Identifier' && right?.['type'] === 'Identifier') {
      const rightName = right['name'] as string
      if (!assigned.has(rightName)) assigned.set(rightName, left['name'] as string)
    }
  })

  return paramNames.map((p) => assigned.get(p) ?? '')
}

function markRenderFn(name: string, fns: RenderFns): void {
  if (name === 'beforeRender') fns.hasBeforeRender = true
  else if (name === 'render2D') fns.hasRender2D = true
  else if (name === 'render') fns.hasRender = true
  else if (name === 'render3D') fns.hasRender3D = true
}

// ── library parsing ──────────────────────────────────────────────────────────

interface LibFnEntry {
  src: string // full function declaration text
}
type LibFnMap = Map<string, LibFnEntry>

function parseLibraryFns(libSrc: string): LibFnMap {
  const ast = parseScript(libSrc) as { body: Record<string, unknown>[] }
  const fns: LibFnMap = new Map()
  for (const node of ast.body) {
    if (node['type'] === 'FunctionDeclaration' && node['id']) {
      const id = node['id'] as Record<string, unknown>
      const name = id['name'] as string
      fns.set(name, {
        src: libSrc.slice(node['start'] as number, node['end'] as number),
      })
    }
  }
  return fns
}

// ── library reference collection ─────────────────────────────────────────────

interface LibRef {
  namespace: string
  fnName: string
  start: number // character offset of `lib.fn` in the source being analysed
  end: number
}

function collectLibraryRefs(ast: unknown, knownLibs: Set<string>): LibRef[] {
  const refs: LibRef[] = []
  walkAst(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] !== 'CallExpression') return
    const callee = n['callee'] as Record<string, unknown>
    if (callee?.['type'] !== 'MemberExpression') return
    if (callee['computed']) return
    const obj = callee['object'] as Record<string, unknown>
    const prop = callee['property'] as Record<string, unknown>
    if (obj?.['type'] !== 'Identifier' || prop?.['type'] !== 'Identifier') return
    const ns = obj['name'] as string
    if (!knownLibs.has(ns)) return
    refs.push({
      namespace: ns,
      fnName: prop['name'] as string,
      start: callee['start'] as number,
      end: callee['end'] as number,
    })
  })
  return refs
}

// ── dependency resolution (BFS) ───────────────────────────────────────────────

interface ResolvedFn {
  namespace: string
  fnName: string
}

function resolveAllDeps(
  initialRefs: LibRef[],
  libFnMaps: Record<string, LibFnMap>,
  allNamespaces: Set<string>,
): ResolvedFn[] {
  const seen = new Set<string>()
  const queue: ResolvedFn[] = []
  const result: ResolvedFn[] = []

  function enqueue(namespace: string, fnName: string): void {
    const key = `${namespace}.${fnName}`
    if (!seen.has(key)) {
      seen.add(key)
      queue.push({ namespace, fnName })
    }
  }

  for (const ref of initialRefs) enqueue(ref.namespace, ref.fnName)

  while (queue.length > 0) {
    const item = queue.shift()!
    result.push(item)

    const libFns = libFnMaps[item.namespace]
    const entry = libFns?.get(item.fnName)
    if (!entry) continue

    // Transitive internal deps (bare calls to other fns in the same library)
    const fnAst = parseScript(entry.src)
    const libFnNames = new Set(libFns!.keys())
    walkAst(fnAst, (node) => {
      const n = node as Record<string, unknown>
      if (n['type'] === 'CallExpression') {
        const callee = n['callee'] as Record<string, unknown>
        if (callee?.['type'] === 'Identifier') {
          const name = callee['name'] as string
          if (libFnNames.has(name)) enqueue(item.namespace, name)
        }
      }
    })

    // Cross-library refs inside this function
    for (const ref of collectLibraryRefs(fnAst, allNamespaces)) {
      enqueue(ref.namespace, ref.fnName)
    }
  }

  return result
}

// ── source rewriting ─────────────────────────────────────────────────────────

interface Rewrite {
  start: number
  end: number
  text: string
}

function rewriteSource(src: string, rewrites: Rewrite[]): string {
  const sorted = [...rewrites].sort((a, b) => b.start - a.start)
  for (const r of sorted) {
    src = src.slice(0, r.start) + r.text + src.slice(r.end)
  }
  return src
}

function mangle(namespace: string, fnName: string): string {
  return `_${namespace}_${fnName}`
}

function inlineFn(
  entry: LibFnEntry,
  namespace: string,
  libFns: LibFnMap,
  allNamespaces: Set<string>,
): string {
  const ast = parseScript(entry.src) as { body: Record<string, unknown>[] }
  const rewrites: Rewrite[] = []
  const libFnNames = new Set(libFns.keys())

  // Rename the function declaration itself
  const funcDecl = ast.body[0]
  if (funcDecl?.['type'] === 'FunctionDeclaration') {
    const id = funcDecl['id'] as Record<string, unknown>
    rewrites.push({
      start: id['start'] as number,
      end: id['end'] as number,
      text: mangle(namespace, id['name'] as string),
    })
  }

  // Rewrite bare calls to other same-library functions
  // and cross-library namespace.fn() calls within this function body
  walkAst(ast, (node) => {
    const n = node as Record<string, unknown>
    if (n['type'] !== 'CallExpression') return
    const callee = n['callee'] as Record<string, unknown>

    if (callee?.['type'] === 'Identifier') {
      const name = callee['name'] as string
      if (libFnNames.has(name)) {
        rewrites.push({
          start: callee['start'] as number,
          end: callee['end'] as number,
          text: mangle(namespace, name),
        })
      }
    }

    if (callee?.['type'] === 'MemberExpression' && !callee['computed']) {
      const obj = callee['object'] as Record<string, unknown>
      const prop = callee['property'] as Record<string, unknown>
      if (obj?.['type'] === 'Identifier' && allNamespaces.has(obj['name'] as string)) {
        rewrites.push({
          start: callee['start'] as number,
          end: callee['end'] as number,
          text: mangle(obj['name'] as string, prop['name'] as string),
        })
      }
    }
  })

  return rewriteSource(entry.src, rewrites)
}

// ── public API ────────────────────────────────────────────────────────────────

export function bundle(
  patternSrc: string,
  libraries: Record<string, string>,
): { code: string; fxCode: string; metadata: BundleMetadata } {
  const patternAst = parseModule(patternSrc)
  const metadata = extractMetadata(patternAst)

  const knownLibs = new Set(Object.keys(libraries))
  const refs = collectLibraryRefs(patternAst, knownLibs)

  if (refs.length === 0) {
    return { code: patternSrc, fxCode: emitFixedPoint(patternSrc), metadata }
  }

  const libFnMaps: Record<string, LibFnMap> = {}
  for (const [ns, src] of Object.entries(libraries)) {
    libFnMaps[ns] = parseLibraryFns(src)
  }

  const resolved = resolveAllDeps(refs, libFnMaps, knownLibs)

  const preamble = resolved
    .map(({ namespace, fnName }) => {
      const entry = libFnMaps[namespace]?.get(fnName)
      if (!entry) return ''
      return inlineFn(entry, namespace, libFnMaps[namespace], knownLibs)
    })
    .filter(Boolean)
    .join('\n') + '\n'

  const patternRewrites: Rewrite[] = refs.map((ref) => ({
    start: ref.start,
    end: ref.end,
    text: mangle(ref.namespace, ref.fnName),
  }))

  const code = preamble + rewriteSource(patternSrc, patternRewrites)
  return {
    code,
    fxCode: emitFixedPoint(code),
    metadata,
  }
}
