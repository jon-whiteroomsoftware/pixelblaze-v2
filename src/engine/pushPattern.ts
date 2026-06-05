// The Send-to-Controller push orchestrator (H10, issue #202; persist mode #236).
// Transport-agnostic: it composes the provider's compile + push capabilities with
// the pure binding logic, so the same flow works against any backend (extension
// today, a Node bridge if the extension route ever falls back). The provider
// supplies the transport-coupled pieces (compile in the helper, push over the
// socket); this module owns the *policy* — run-only vs save, which program id to
// overwrite, when to mint, and persisting the binding.
//
// TWO MODES (#236):
//   - run-only (today's default): compile, mint a *throwaway* id, and load + run via
//     `pushBytecode` — exactly as the reference client's `sendPatternToRenderer`. It
//     never enters the device's program list, so it must NOT consult or churn the
//     binding (the #236 reframe — overwrite-in-place only makes sense for a *saved*
//     pattern, since a run-only id never lists and so always missed, minting + re-
//     persisting a fresh binding every push).
//   - save (`persist: true`): compile, encode a PBP blob, and write it via
//     `saveProgram`, creating the persisted `/p/{id}` record that appears in Saved
//     Patterns with its name. Here overwrite-in-place applies: reuse the bound id when
//     it is still on the device, else mint, and persist a freshly-minted binding.
//
// Control values are never part of either push — the binding is identity only.
//
// Zero React, zero transport specifics; every dependency is injected so the whole
// flow is unit-testable with a fake provider + in-memory binding store.

import type { ControllerProvider } from './ControllerProvider'
import { bytecodeHeaderReconciles, makeProgramId } from './bytecodePush'
import { encodePbp } from './pbpEncode'
import { resolvePushTarget, withBinding, type BindingStore } from './controllerBinding'

export interface PushPatternDeps {
  /** The connected backend — only the push-relevant surface is needed. */
  provider: Pick<ControllerProvider, 'compile' | 'pushBytecode' | 'saveProgram' | 'listPrograms'>
  /** Stable id of the target Controller (its address/device id) — the binding key.
   *  Used in save mode only. */
  controllerId: string
  /** The IDE pattern's id — the other half of the binding key. Save mode only. */
  patternId: string
  /** Pattern source to compile + push. */
  source: string
  /** Human label stored with the program on the device. Defaults to ''. */
  name?: string
  /** When true, write a persisted PBP record (appears in Saved Patterns; overwrite-
   *  in-place via the binding). When false/undefined, run-only — load + run under a
   *  throwaway id, no binding. */
  persist?: boolean
  /** Load the persisted binding store (e.g. from IndexedDB). Save mode only. */
  loadBindings: () => Promise<BindingStore>
  /** Persist the binding store after a freshly-minted binding. Save mode only. */
  saveBindings: (bindings: BindingStore) => Promise<void>
  /** Injectable id minter (determinism in tests). Defaults to makeProgramId. */
  mintId?: () => string
}

export interface PushPatternResult {
  /** The device program id the pattern was pushed to. */
  programId: string
  /** True when this push created a new program (run-only always mints; save mode on a
   *  first push or silent re-create); false when save mode overwrote a bound program. */
  created: boolean
}

/** Compile, frame, and push the open pattern to the connected Controller. Run-only
 *  loads + runs under a throwaway id; save mode writes a persisted PBP record,
 *  overwriting in place per the remembered per-Controller binding. Throws on a
 *  compile failure or a bytecode that fails the header sanity check (so a bad blob
 *  is never pushed). */
export async function pushPattern(deps: PushPatternDeps): Promise<PushPatternResult> {
  const mint = deps.mintId ?? makeProgramId

  const bytecode = await deps.provider.compile(deps.source)
  if (!bytecodeHeaderReconciles(bytecode)) {
    throw new Error('Compiled bytecode failed its header sanity check; not pushing')
  }

  // Run-only: throwaway id, load + run, no list read and no binding (the #236 reframe).
  if (!deps.persist) {
    const programId = mint()
    await deps.provider.pushBytecode(bytecode, { id: programId, name: deps.name ?? '' })
    return { programId, created: true }
  }

  // Save mode: overwrite-in-place. The program list resolves the binding (a since-
  // deleted id re-mints); the binding store remembers the target.
  const [programs, bindings] = await Promise.all([
    deps.provider.listPrograms(),
    deps.loadBindings(),
  ])
  const { programId, isNew } = resolvePushTarget(
    bindings[deps.controllerId],
    deps.patternId,
    programs.map((p) => p.id),
    mint,
  )

  const blob = encodePbp({
    id: programId,
    name: deps.name ?? '',
    sourceCode: deps.source,
    byteCode: bytecode,
  })
  await deps.provider.saveProgram(blob, { id: programId })

  if (isNew) {
    await deps.saveBindings(withBinding(bindings, deps.controllerId, deps.patternId, programId))
  }

  return { programId, created: isNew }
}
