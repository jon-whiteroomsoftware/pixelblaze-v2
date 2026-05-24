import { create } from 'zustand'

export type CompileStatus = 'good' | 'broken'

interface EditorState {
  compileStatus: CompileStatus
  setCompileStatus: (status: CompileStatus) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
}))
