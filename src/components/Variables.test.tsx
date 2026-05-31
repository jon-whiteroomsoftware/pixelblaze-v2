import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Variables } from './Variables'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('Variables pattern-variable watch', () => {
  it('hides variables until the turn-down is opened, then shows them all', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ patternVars: ['t1', 'hue'] })
    usePreviewStore.setState({ watchValues: { t1: 0.5, hue: 0.25 } })
    render(<Variables />)

    // Collapsed by default: variables hidden, only the disclosure label shows.
    expect(screen.queryByText('t1')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /variables/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(usePreviewStore.getState().watchPatternVars).toBe(true)
    expect(screen.getByText('t1')).toBeInTheDocument()
    expect(screen.getByText('hue')).toBeInTheDocument()
  })

  it('renders nothing when the pattern exports no variables', () => {
    useEditorStore.setState({ patternVars: [] })
    const { container } = render(<Variables />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /variables/i })).not.toBeInTheDocument()
  })
})
