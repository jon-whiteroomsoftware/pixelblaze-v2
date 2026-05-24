import { create } from 'zustand'
import { SEED_PATTERN } from '@/pixelblaze/seedPattern'

export type CompileStatus = 'good' | 'broken'

interface EditorState {
  compileStatus: CompileStatus
  source: string
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  source: SEED_PATTERN,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setSource: (source) => set({ source }),
}))
