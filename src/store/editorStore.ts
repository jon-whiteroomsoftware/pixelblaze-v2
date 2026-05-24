import { create } from 'zustand'

export type CompileStatus = 'good' | 'broken'

interface EditorState {
  compileStatus: CompileStatus
  source: string
  isReadOnly: boolean
  previewSource: string
  previewPatternName: string
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
  setPreviewSource: (src: string) => void
  setPreviewPatternName: (name: string) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  source: '',
  isReadOnly: true,
  previewSource: '',
  previewPatternName: '',
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setSource: (source) => set({ source }),
  setIsReadOnly: (isReadOnly) => set({ isReadOnly }),
  setPreviewSource: (previewSource) => set({ previewSource }),
  setPreviewPatternName: (previewPatternName) => set({ previewPatternName }),
}))
