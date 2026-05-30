import { create } from 'zustand'
import type { PatternMetadata } from '@/engine/loadPattern'

export type CompileStatus = 'good' | 'broken'

interface EditorState {
  compileStatus: CompileStatus
  source: string
  isReadOnly: boolean
  previewSource: string
  previewPatternName: string
  patternVars: string[]
  controls: PatternMetadata['controls']
  // The active pattern's native dimensionality (highest render fn) — drives the
  // read-only title-bar dimensionality indicator and the default layout on open.
  nativeDim: 1 | 2 | 3
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
  setPreviewSource: (src: string) => void
  setPreviewPatternName: (name: string) => void
  setPatternVars: (vars: string[]) => void
  setControls: (controls: PatternMetadata['controls']) => void
  setNativeDim: (dim: 1 | 2 | 3) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  source: '',
  isReadOnly: true,
  previewSource: '',
  previewPatternName: '',
  patternVars: [] as string[],
  controls: [] as PatternMetadata['controls'],
  nativeDim: 2 as 1 | 2 | 3,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setSource: (source) => set({ source }),
  setIsReadOnly: (isReadOnly) => set({ isReadOnly }),
  setPreviewSource: (previewSource) => set({ previewSource }),
  setPreviewPatternName: (previewPatternName) => set({ previewPatternName }),
  setPatternVars: (patternVars) => set({ patternVars }),
  setControls: (controls) => set({ controls }),
  setNativeDim: (nativeDim) => set({ nativeDim }),
}))
