import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { DEMOS } from '@/pixelblaze/demos'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('PatternList', () => {
  it('clicking a demo sets previewSource to the demo source', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewSource).toBe(DEMOS[demoName])
  })

  it('clicking a demo sets previewPatternName to the demo name', async () => {
    const user = userEvent.setup()
    render(<PatternList />)

    const demoName = Object.keys(DEMOS).sort()[0]
    await user.click(screen.getByText(new RegExp(`^${demoName}`)))

    expect(useEditorStore.getState().previewPatternName).toBe(demoName)
  })
})
