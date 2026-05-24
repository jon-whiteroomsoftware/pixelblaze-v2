import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore, editorInitialState } from './editorStore'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
})

describe('editorStore', () => {
  it('starts with good compile status', () => {
    expect(useEditorStore.getState().compileStatus).toBe('good')
  })

  it('setCompileStatus updates status', () => {
    useEditorStore.getState().setCompileStatus('broken')
    expect(useEditorStore.getState().compileStatus).toBe('broken')
  })

  it('setCompileStatus can return to good', () => {
    useEditorStore.getState().setCompileStatus('broken')
    useEditorStore.getState().setCompileStatus('good')
    expect(useEditorStore.getState().compileStatus).toBe('good')
  })

  it('starts with empty previewSource', () => {
    expect(useEditorStore.getState().previewSource).toBe('')
  })

  it('setPreviewSource updates previewSource', () => {
    const src = 'export function render2D(i,x,y){}'
    useEditorStore.getState().setPreviewSource(src)
    expect(useEditorStore.getState().previewSource).toBe(src)
  })

  it('starts with empty previewPatternName', () => {
    expect(useEditorStore.getState().previewPatternName).toBe('')
  })

  it('setPreviewPatternName updates previewPatternName', () => {
    useEditorStore.getState().setPreviewPatternName('Rainbow Waves')
    expect(useEditorStore.getState().previewPatternName).toBe('Rainbow Waves')
  })
})
