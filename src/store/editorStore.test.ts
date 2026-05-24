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
})
