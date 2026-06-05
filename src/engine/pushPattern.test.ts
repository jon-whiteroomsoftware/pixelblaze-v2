import { describe, it, expect, vi } from 'vitest'
import { pushPattern, type PushPatternDeps } from './pushPattern'
import { decodePbp } from './pbpEncode'
import type { BindingStore } from './controllerBinding'

// A reconciling bytecode blob: header declares 0 opcode + 0 export bytes, len 8.
function goodBytecode(): Uint8Array {
  return new Uint8Array(8)
}

// A bad blob whose header does not reconcile with its length.
function badBytecode(): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setUint32(0, 99, true) // claims 99 opcode bytes
  return b
}

function makeProvider(overrides: Partial<PushPatternDeps['provider']> = {}) {
  return {
    compile: vi.fn().mockResolvedValue(goodBytecode()),
    listPrograms: vi.fn().mockResolvedValue([]),
    pushBytecode: vi.fn().mockResolvedValue(undefined),
    saveProgram: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeDeps(overrides: Partial<PushPatternDeps> = {}): {
  deps: PushPatternDeps
  saved: BindingStore[]
} {
  const saved: BindingStore[] = []
  const deps: PushPatternDeps = {
    provider: makeProvider(),
    controllerId: 'ctrl-A',
    patternId: 'pat-1',
    source: 'export function render(i){}',
    name: 'My Pattern',
    loadBindings: async () => ({}),
    saveBindings: async (b) => {
      saved.push(b)
    },
    mintId: () => 'MINTED00000000000',
    ...overrides,
  }
  return { deps, saved }
}

describe('pushPattern — run-only (default)', () => {
  it('mints a throwaway id and loads + runs via pushBytecode, never touching the binding', async () => {
    const { deps, saved } = makeDeps()
    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'MINTED00000000000', created: true })
    expect(deps.provider.pushBytecode).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
      name: 'My Pattern',
    })
    // The #236 reframe: run-only never consults the program list or persists a binding.
    expect(deps.provider.listPrograms).not.toHaveBeenCalled()
    expect(deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('mints a fresh throwaway id each push (no overwrite-in-place)', async () => {
    let n = 0
    const { deps } = makeDeps({ mintId: () => `MINT${n++}000000000000` })
    const a = await pushPattern(deps)
    const b = await pushPattern(deps)
    expect(a.programId).not.toBe(b.programId)
  })
})

describe('pushPattern — save mode (persist: true)', () => {
  it('mints + binds + saves a PBP record on the first save for a pattern', async () => {
    const { deps, saved } = makeDeps({ persist: true })
    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'MINTED00000000000', created: true })
    expect(deps.provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
    })
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'MINTED00000000000' } }])
  })

  it('encodes the PBP blob with the pattern name and source', async () => {
    const { deps } = makeDeps({
      persist: true,
      name: 'Rainbow',
      source: 'export function render(index){ hsv(0,1,1) }',
    })
    await pushPattern(deps)
    const [blob] = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0]
    const decoded = decodePbp(blob as Uint8Array)
    expect(decoded!.name).toBe('Rainbow')
    expect(decoded!.sourceCode).toBe('export function render(index){ hsv(0,1,1) }')
  })

  it('reuses the bound id (overwrite in place) and does NOT re-save the binding when still on the device', async () => {
    const { deps, saved } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'DEVPROG1', name: 'x' }]),
      }),
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'DEVPROG1', created: false })
    expect(deps.provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'DEVPROG1',
    })
    expect(saved).toEqual([]) // no re-save when reusing
  })

  it('silently re-creates when the bound id was deleted on the device', async () => {
    const { deps, saved } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'SOMETHING_ELSE', name: 'y' }]),
      }),
      mintId: () => 'REMINTED000000000',
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'REMINTED000000000', created: true })
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'REMINTED000000000' } }])
  })

  it('preserves sibling bindings when adding a new one', async () => {
    const { deps, saved } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-B': { 'pat-9': 'D9' } }),
    })
    await pushPattern(deps)
    expect(saved[0]).toEqual({
      'ctrl-B': { 'pat-9': 'D9' },
      'ctrl-A': { 'pat-1': 'MINTED00000000000' },
    })
  })
})

describe('pushPattern — guards (both modes)', () => {
  it('throws and does not push when the bytecode header does not reconcile', async () => {
    const { deps, saved } = makeDeps({
      provider: makeProvider({ compile: vi.fn().mockResolvedValue(badBytecode()) }),
    })
    await expect(pushPattern(deps)).rejects.toThrow(/header sanity check/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('propagates a compile failure without pushing', async () => {
    const { deps } = makeDeps({
      provider: makeProvider({
        compile: vi.fn().mockRejectedValue(new Error('compile FAILED: syntax')),
      }),
    })
    await expect(pushPattern(deps)).rejects.toThrow(/compile FAILED/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
  })
})
