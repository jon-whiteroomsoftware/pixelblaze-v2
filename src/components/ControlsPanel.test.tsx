import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlsPanel } from './ControlsPanel'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useControlStore } from '@/store/controlStore'

beforeEach(() => {
  useEditorStore.setState(editorInitialState)
  useControlStore.setState({ controlValues: {} })
})

describe('ControlsPanel help hint', () => {
  it('shows a help affordance and lists control descriptions when present', async () => {
    const user = userEvent.setup()
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed', description: 'How fast it goes.' },
    ])
    render(<ControlsPanel />)

    const help = screen.getByRole('button', { name: /about these controls/i })
    await user.click(help)
    expect(screen.getByText(/how fast it goes/i)).toBeInTheDocument()
  })

  it('omits the help affordance when no control has a description', () => {
    useEditorStore.getState().setControls([
      { exportName: 'sliderSpeed', kind: 'slider', label: 'Speed' },
    ])
    render(<ControlsPanel />)
    expect(screen.queryByRole('button', { name: /about these controls/i })).not.toBeInTheDocument()
  })
})
