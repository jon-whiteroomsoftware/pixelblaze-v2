import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PatternList } from './PatternList'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { DEMOS } from '@/pixelblaze/demos'

vi.mock('@/engine/storage', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/engine/storage')>()
  return {
    ...orig,
    listPatterns: vi.fn().mockResolvedValue([
      { id: 'seed-1', name: 'Seed Pattern', src: '// seed', controls: {}, updatedAt: 0 },
    ]),
    getSetting: vi.fn().mockResolvedValue(undefined),
    setSetting: vi.fn().mockResolvedValue(undefined),
    createPattern: vi.fn().mockResolvedValue(undefined),
  }
})

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
