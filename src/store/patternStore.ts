import { create } from 'zustand'
import {
  PatternRecord,
  createPattern,
  listPatterns,
  updatePattern,
  deletePattern,
  getSetting,
  setSetting,
} from '@/engine/storage'
import type { Settings } from '@/engine/settings'

export type { PatternRecord }

export const LAST_ACTIVE_KEY = 'lastActive'

// The persisted demo-override layer (ADR-0013 amendment). A demo carries no
// PatternRecord — its code is read-only and shipped in the app — but it still gets a
// persistent cascade layer-1 override bag so the user's tweaks survive a reopen, just
// like a user pattern. The whole map (demo name → sparse overrides) lives under one
// key in the settings KV store.
export const DEMO_OVERRIDES_KEY = 'demoOverrides'

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }

interface PatternState {
  activePatternId: string | null
  activeLibraryName: string | null
  activeDemoName: string | null
  userPatterns: PatternRecord[]
  // Persisted per-demo settings overrides (cascade layer 1, ADR-0013 amendment),
  // keyed by demo name. Parallel to PatternRecord.settings for user patterns; a demo
  // has no record so its bag lives here instead.
  demoOverrides: Record<string, Partial<Settings>>
  setActivePattern: (id: string | null) => void
  setActiveLibrary: (name: string | null) => void
  setActiveDemo: (name: string | null) => void
  loadPatterns: () => Promise<void>
  // Hydrate the persisted demo-override map from the settings KV store at startup,
  // alongside loadPatterns.
  loadDemoOverrides: () => Promise<void>
  addPattern: (record: PatternRecord) => Promise<void>
  renamePattern: (id: string, name: string) => Promise<void>
  removePattern: (id: string) => Promise<void>
  updatePatternSrc: (id: string, src: string) => Promise<void>
  // Sparse-merge per-pattern settings overrides (cascade layer 1, ADR-0013) onto the
  // record, in both IndexedDB and the in-memory list, so reopening restores them this
  // session. Called from a control's own change handler on genuine manipulation —
  // never inferred by comparing a stored value to a default.
  updatePatternSettings: (id: string, patch: Partial<Settings>) => Promise<void>
  // Clear a pattern's layer-1 overrides ("Reset to defaults", ADR-0013), dropping it
  // back to recommended + global-sticky + dev-default on the next resolve.
  resetPatternSettings: (id: string) => Promise<void>
  // Sparse-merge per-demo settings overrides (cascade layer 1) — the demo equivalent
  // of updatePatternSettings, persisted into the demoOverrides KV map.
  updateDemoSettings: (name: string, patch: Partial<Settings>) => Promise<void>
  // Clear a demo's layer-1 overrides ("Revert to recommended"), dropping it back to
  // recommended + global-sticky + dev-default on the next resolve.
  resetDemoSettings: (name: string) => Promise<void>
}

// The stable identity of the open *pushable* pattern — the key Send-to-Controller
// uses for its device binding (save mode) and its dirty-track records. A user
// pattern is keyed by its record id; a demo, which carries no record, by a
// `demo:`-namespaced key off its name, so demos can be pushed and dirty-tracked
// without first forking into the user area. Libraries are not patterns, so they
// have no key (null → the Send button doesn't render). The `demo:` namespace
// keeps demo and user ids from ever colliding in the binding/dirty maps.
export function activePushKey(
  s: Pick<PatternState, 'activePatternId' | 'activeDemoName'>,
): string | null {
  if (s.activePatternId !== null) return s.activePatternId
  if (s.activeDemoName !== null) return `demo:${s.activeDemoName}`
  return null
}

export const patternInitialState = {
  activePatternId: null as string | null,
  activeLibraryName: null as string | null,
  activeDemoName: null as string | null,
  userPatterns: [] as PatternRecord[],
  demoOverrides: {} as Record<string, Partial<Settings>>,
}

export const usePatternStore = create<PatternState>()((set, get) => ({
  ...patternInitialState,

  setActivePattern: (id) => {
    set({ activePatternId: id, activeLibraryName: null, activeDemoName: null })
    if (id !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'pattern', id }).catch(() => {})
  },
  setActiveLibrary: (name) => {
    set({ activeLibraryName: name, activePatternId: null, activeDemoName: null })
    if (name !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'library', name }).catch(() => {})
  },
  setActiveDemo: (name) => {
    set({ activeDemoName: name, activeLibraryName: null, activePatternId: null })
    if (name !== null) setSetting<LastActive>(LAST_ACTIVE_KEY, { type: 'demo', name }).catch(() => {})
  },

  loadPatterns: async () => {
    const patterns = await listPatterns()
    set({ userPatterns: patterns.sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  loadDemoOverrides: async () => {
    const stored = await getSetting<Record<string, Partial<Settings>>>(DEMO_OVERRIDES_KEY).catch(
      () => undefined,
    )
    if (stored) set({ demoOverrides: stored })
  },

  addPattern: async (record) => {
    await createPattern(record)
    set((s) => ({
      userPatterns: [record, ...s.userPatterns],
    }))
  },

  renamePattern: async (id, name) => {
    const updatedAt = Date.now()
    await updatePattern(id, { name, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, name, updatedAt } : p,
      ),
    }))
  },

  removePattern: async (id) => {
    await deletePattern(id)
    const { activePatternId, userPatterns } = get()
    const remaining = userPatterns.filter((p) => p.id !== id)
    set({
      userPatterns: remaining,
      activePatternId: activePatternId === id ? (remaining[0]?.id ?? null) : activePatternId,
    })
  },

  updatePatternSrc: async (id, src) => {
    const updatedAt = Date.now()
    await updatePattern(id, { src, updatedAt })
    set((s) => ({
      userPatterns: s.userPatterns.map((p) =>
        p.id === id ? { ...p, src, updatedAt } : p,
      ),
    }))
  },

  updatePatternSettings: async (id, patch) => {
    // Sparse merge over any existing overrides; the src/updatedAt bump is
    // intentionally skipped: a settings override is a display-side concern, not an
    // edit to the pattern's code, so it shouldn't reorder the recents list.
    let merged: Partial<Settings> | undefined
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => {
        if (p.id !== id) return p
        merged = { ...p.settings, ...patch }
        return { ...p, settings: merged }
      }),
    }))
    if (merged === undefined) return
    await updatePattern(id, { settings: merged }).catch(() => {})
  },

  resetPatternSettings: async (id) => {
    set((s) => ({
      userPatterns: s.userPatterns.map((p) => (p.id === id ? { ...p, settings: {} } : p)),
    }))
    await updatePattern(id, { settings: {} }).catch(() => {})
  },

  updateDemoSettings: async (name, patch) => {
    // Sparse merge over any existing demo overrides, then persist the whole map.
    let next: Record<string, Partial<Settings>> | undefined
    set((s) => {
      next = { ...s.demoOverrides, [name]: { ...s.demoOverrides[name], ...patch } }
      return { demoOverrides: next }
    })
    if (next) await setSetting(DEMO_OVERRIDES_KEY, next).catch(() => {})
  },

  resetDemoSettings: async (name) => {
    let next: Record<string, Partial<Settings>> | undefined
    set((s) => {
      const { [name]: _drop, ...rest } = s.demoOverrides
      next = rest
      return { demoOverrides: next }
    })
    if (next) await setSetting(DEMO_OVERRIDES_KEY, next).catch(() => {})
  },
}))
