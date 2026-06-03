import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpHint } from './HelpHint'

describe('HelpHint', () => {
  it('renders an accessible trigger and hides the content until opened', () => {
    render(<HelpHint label="About these controls">hello help</HelpHint>)
    expect(screen.getByRole('button', { name: 'About these controls' })).toBeInTheDocument()
    expect(screen.queryByText('hello help')).not.toBeInTheDocument()
  })

  it('opens the popover on click and closes it on Escape', async () => {
    const user = userEvent.setup()
    render(<HelpHint label="About these controls">hello help</HelpHint>)
    const trigger = screen.getByRole('button', { name: 'About these controls' })

    await user.click(trigger)
    expect(screen.getByText('hello help')).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByText('hello help')).not.toBeInTheDocument()
  })

  it('opens on keyboard focus', async () => {
    const user = userEvent.setup()
    render(<HelpHint label="About these controls">hello help</HelpHint>)
    await user.tab()
    expect(screen.getByText('hello help')).toBeInTheDocument()
  })
})
