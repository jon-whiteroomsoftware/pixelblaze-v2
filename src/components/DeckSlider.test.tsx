import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { DeckSlider } from './DeckSlider'

describe('DeckSlider', () => {
  it('shows the value when set', () => {
    render(<DeckSlider label="brightness" value={0.75} min={0} max={1} step={0.01} onChange={() => {}} />)
    const slider = screen.getByLabelText('brightness') as HTMLInputElement
    expect(slider.value).toBe('0.75')
    expect(screen.getByText('0.75')).toBeInTheDocument()
  })

  it('renders an indeterminate (hollow-ring, dashed) state when value is null', () => {
    render(<DeckSlider label="brightness" value={null} min={0} max={1} step={0.01} onChange={() => {}} />)
    const slider = screen.getByLabelText('brightness') as HTMLInputElement
    // Thumb centered on an empty track (no fill implying a value); the hollow-ring
    // styling marks it interactive-but-unset rather than disabled.
    expect(slider.value).toBe('0.5')
    expect(slider.className).toContain('deck-slider-unset')
    // Readout is a dash, not "0.00", so no misleading zero flashes before the read.
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0.00')).not.toBeInTheDocument()
  })

  it('stays draggable while indeterminate — dragging is how the user sets it', () => {
    const onChange = vi.fn()
    render(<DeckSlider label="speed" value={null} min={0} max={1} step={0.01} onChange={onChange} />)
    const slider = screen.getByLabelText('speed') as HTMLInputElement
    expect(slider.disabled).toBe(false)
    fireEvent.change(slider, { target: { value: '0.4' } })
    expect(onChange).toHaveBeenCalledWith(0.4)
  })
})
