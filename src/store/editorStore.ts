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
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
  setPreviewSource: (src: string) => void
  setPreviewPatternName: (name: string) => void
  setPatternVars: (vars: string[]) => void
  setControls: (controls: PatternMetadata['controls']) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  source: '',
  isReadOnly: true,
  previewSource: '',
  previewPatternName: '',
  patternVars: [] as string[],
  controls: [] as PatternMetadata['controls'],
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
}))
