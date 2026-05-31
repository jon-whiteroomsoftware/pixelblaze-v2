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
  // The active LAYOUT's display dimensionality (the shape/map being drawn), which
  // can differ from `nativeDim` (a 1D pattern on a 3D shape displays as 3D). Gates
  // the viewport's camera control set (#129, ADR-0005). This is a VIEWPORT concern
  // only — it is not the layout's coordinate dimension (that's `nativeDim`), so a
  // 2D pattern wrapped onto a 3D cylinder has displayDim 3 but stays a 2D layout.
  displayDim: 1 | 2 | 3
  // The realized layout readout (e.g. "32×32", "8×8×8"), computed by Preview from
  // the actual arrangement, or null when there's no regular grid to show (a 1D
  // strip, or an irregular custom point cloud). Reflects the true geometry rather
  // than re-deriving it from the viewport dimension.
  layoutLabel: string | null
  setCompileStatus: (status: CompileStatus) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
  setPreviewSource: (src: string) => void
  setPreviewPatternName: (name: string) => void
  setPatternVars: (vars: string[]) => void
  setControls: (controls: PatternMetadata['controls']) => void
  setNativeDim: (dim: 1 | 2 | 3) => void
  setDisplayDim: (dim: 1 | 2 | 3) => void
  setLayoutLabel: (label: string | null) => void
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
  displayDim: 2 as 1 | 2 | 3,
  layoutLabel: null as string | null,
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
  setDisplayDim: (displayDim) => set({ displayDim }),
  setLayoutLabel: (layoutLabel) => set({ layoutLabel }),
}))
